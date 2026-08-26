import type { NewsItem, Priority } from "@shared/types";
import { getSecret } from "../secrets";
import { fetchArticles, type Fetched } from "./article";
import { INTERESTS } from "./interests";

/**
 * 뉴스 요약 — 여기서만 토큰을 쓴다.
 *
 * 두 번 부른다. 한 번에 다 하지 않는 이유는 재료가 다르기 때문이다:
 *
 *   1차 — 전부(83건)를 **제목 + 피드 본문**으로 훑어 층을 나눈다.
 *         출력은 대부분 id 라서 짧다.
 *   2차 — 먼저 볼 것으로 뽑힌 몇 건만 **원문을 가져와** 제대로 요약한다.
 *
 * 전부 원문을 붙이면 하루 약 91,000 토큰이다(실측). 이 방식은 약 14,000 이다.
 * 안 읽을 기사에 원문을 붙이는 게 그 차이의 전부다.
 *
 * 시스템 프롬프트는 매일 같아서 캐시를 건다.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

/**
 * 판단이 이 기능의 전부라 값싼 모델로 내리지 않는다.
 * 실측 입력이 4,000 토큰대라 등급을 낮춰 아끼는 폭도 의미가 없다.
 */
const MODEL = "claude-sonnet-5";

/**
 * 층은 **점수로 정한다.** 개수로 정하지 않는다.
 *
 * ⚠ 예전엔 "먼저 볼 것 8건을 골라라" 였다. 그러면 모델은 **늘 8건을 채운다** —
 *   상한이 목표치가 되어, 쓸 만한 게 셋뿐인 날에도 억지로 다섯을 더 올렸다.
 *   실제로 2026-08-26 브리핑이 1층 8 · 2층 29 · 3층 71 이었고, 3층은 고른 게
 *   아니라 "안 고른 나머지 전부" 였다(topic 이 하나도 안 붙어 있었다).
 *   점수로 바꾸면 개수는 결과가 된다. 90점이 없는 날은 1층이 빈다. 그게 맞다.
 *
 * ⚠ 그래도 상한을 남겨 둔 이유: LLM 점수는 **교정되지 않는다.** 같은 기준을
 *   줘도 그날 목록 구성에 따라 전체가 위아래로 밀린다. 시끄러운 날 90점이
 *   스무 건 나오면 다시 붐빈다. 점수가 층을 정하고 상한은 넘침만 막는다.
 *   **최소치는 두지 않는다** — 채우기 시작하면 점수를 매긴 의미가 없다.
 *
 * ★ 경계를 바꾸고 싶으면 여기만 고친다. 점수가 아카이브에 남으므로
 *   나중에 "그때 경계가 이랬으면 어땠나" 를 데이터로 확인할 수 있다.
 */
const TIERS = [
  { priority: 1 as const, min: 90, max: 5 },
  { priority: 2 as const, min: 75, max: 12 },
  { priority: 3 as const, min: 60, max: 15 },
];

/** 이 아래는 모델이 아예 적지 않는다. 화면에도 안 나온다. */
const FLOOR = TIERS[TIERS.length - 1].min;

/**
 * 원문을 가져와 제대로 요약할 건수. 토큰이 여기서 갈린다.
 * 1층 상한과 같게 두되, 1층이 비는 날에도 0 건이 되지 않도록 따로 둔다.
 */
const DEEP_MAX = 5;

const TIMEOUT_MS = 120_000;

export type Usage = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

export type SummarizeResult =
  | {
      ok: true;
      news: NewsItem[];
      headline: string;
      usage: Usage;
      /** 사람이 봐야 할 것 — 원문을 못 가져온 기사 등 */
      notes: string[];
      /**
       * 먼저 볼 것으로 뽑혀 크롤링한 원문. 2차 호출이 실제로 읽은 재료다.
       * 보관해 두면 **다시 긁지 않고** 프롬프트만 바꿔 요약을 재현할 수 있다.
       */
      articles: Fetched[];
    }
  | { ok: false; kind: "no_key" | "api" | "shape"; message: string };

export async function summarize(items: NewsItem[]): Promise<SummarizeResult> {
  const key = getSecret("anthropic");
  if (!key) {
    return {
      ok: false,
      kind: "no_key",
      message: "설정 → 요약 API 에 Anthropic 키를 먼저 넣어 주세요",
    };
  }
  if (items.length === 0) {
    return { ok: true, news: [], headline: "", usage: empty(), notes: [], articles: [] };
  }

  const usage = empty();
  const notes: string[] = [];

  // ── 1차 · 층 나누기 ────────────────────────────────────
  let triage: Triage;
  try {
    const call = await ask(key, {
      system: TRIAGE_SYSTEM,
      user: triagePrompt(items),
      tool: TRIAGE_TOOL,
      maxTokens: 4_000,
    });
    add(usage, call.usage);
    triage = readTriage(call.input, items);
  } catch (error) {
    return toFailure(error);
  }

  const byId = new Map(items.map((item) => [item.id, item]));

  /* 점수 → 층. 코드가 나눈다. 모델은 점수만 매긴다.
     높은 점수부터 상한만큼 담고, 넘치면 버린다 — 채우지는 않는다. */
  const tier = new Map<string, Priority>();
  const scores = new Map<string, number>();
  const topics = new Map<string, string>();
  const heads = new Map<string, string>();
  const ranked = [...triage.picks].sort((a, b) => b.score - a.score);

  for (const band of TIERS) {
    const next = band === TIERS[0] ? Infinity : bandAbove(band).min;
    const inBand = ranked.filter((p) => p.score >= band.min && p.score < next);
    for (const pick of inBand.slice(0, band.max)) tier.set(pick.id, band.priority);
  }
  for (const pick of triage.picks) {
    scores.set(pick.id, pick.score);
    if (pick.topic) topics.set(pick.id, pick.topic);
    if (pick.headline) heads.set(pick.id, pick.headline);
  }

  /* 원문까지 읽을 것 — 1층부터 점수 순으로. 1층이 빈 날에도 2층 상위를
     읽어 브리핑이 통째로 비지 않게 한다. */
  const deepList = ranked
    .filter((pick) => tier.has(pick.id))
    .map((pick) => byId.get(pick.id))
    .filter((item): item is NewsItem => item !== undefined)
    .slice(0, DEEP_MAX);

  // ── 2차 · 뽑힌 몇 건만 원문으로 ────────────────────────
  const deep = new Map<string, { headline: string; summary: string; relevance: string }>();
  let fetched: Fetched[] = [];

  if (deepList.length > 0) {
    fetched = await fetchArticles(deepList);
    for (const one of fetched) {
      if (one.error) {
        const title = byId.get(one.id)?.title ?? one.id;
        notes.push(`원문 못 가져옴 · ${title} (${one.error})`);
      }
    }

    try {
      const call = await ask(key, {
        system: BRIEF_SYSTEM,
        user: briefPrompt(deepList, fetched),
        tool: BRIEF_TOOL,
        maxTokens: 4_000,
      });
      add(usage, call.usage);
      for (const one of readBrief(call.input)) deep.set(one.id, one);
    } catch (error) {
      // 2차가 실패해도 1차 판단은 살린다. 층이라도 나뉜 채로 저장하는 게
      // 아무것도 없는 것보다 낫다 — 실패를 이유로 하루치를 통째로 버리지 않는다.
      const detail = error instanceof Error ? error.message : String(error);
      notes.push(`먼저 볼 것 요약 실패 · ${detail}`);
    }
  }

  /* 문턱을 못 넘은 기사는 **아예 담지 않는다.** 예전엔 3층으로 흘려보냈는데,
     그건 고른 게 아니라 나머지라서 화면 한 층이 잡동사니로 찼다. */
  const news = items
    .filter((item) => tier.has(item.id))
    .map((item) => {
      const detail = deep.get(item.id);
      const topic = topics.get(item.id);
      /* 표제는 1차(모든 항목)가 만들고, 원문을 읽은 2차가 있으면 그것으로
         덮는다. 2차는 본문을 봤으니 더 정확하다. 없으면 1차 것을 쓴다 —
         2·3층은 원문을 안 읽으므로 늘 1차 표제다. */
      const headline = detail?.headline || heads.get(item.id) || "";
      return {
        ...item,
        priority: tier.get(item.id) as Priority,
        score: scores.get(item.id),
        ...(topic ? { topic } : {}),
        ...(headline ? { headline } : {}),
        ...(detail?.summary ? { summary: detail.summary } : {}),
        ...(detail?.relevance ? { relevance: detail.relevance } : {}),
      };
    })
    .sort((a, b) => a.priority - b.priority || (b.score ?? 0) - (a.score ?? 0));

  return { ok: true, news, headline: triage.headline, usage, notes, articles: fetched };
}

/** 바로 위 층. 구간의 위쪽 끝을 구하는 데 쓴다. */
function bandAbove(band: (typeof TIERS)[number]) {
  return TIERS[TIERS.indexOf(band) - 1];
}

// ── 프롬프트 ─────────────────────────────────────────────

const TRIAGE_SYSTEM = `당신은 개발자 한 사람을 위한 아침 브리핑을 만든다.
하루치 기사 목록을 받아 **각 기사에 0~100 점을 매기는 것**이 일이다.

${INTERESTS}

점수 기준이다. 숫자만 보지 말고 이 설명에 맞춰라:

- **90~100** 지금 쓰는 도구가 실제로 바뀐다. 오늘 조치가 필요하다.
  (보안 릴리스, 쓰는 라이브러리의 파괴적 변경, 쓰는 도구의 새 기능)
- **75~89** 오늘 써먹을 수 있는 기법·함정·실측 결과. 1차 발표.
- **60~74** 알아두면 좋지만 안 읽어도 그만이다.
- **60 미만** 관심사 밖이다. **적지 마라.**

⚠ **60점 미만은 목록에 넣지 않는다.** 대부분이 여기 해당한다 —
  전부 적으려 하지 마라. 하루 100건이 들어와도 20건 남짓만 적히는 게 정상이다.

⚠ 점수를 후하게 주지 마라. 90점은 **오늘 손을 움직여야 하는 것**이다.
  흥미로운 것과 조치가 필요한 것은 다르다. 하루에 90점이 하나도 없는 날이
  이상한 날이 아니다. 그런 날이 대부분이다.

⚠ 개수를 맞추려 하지 마라. 90점짜리가 하나뿐이면 하나만 적는다.

판단할 때:
- 제목만 보고 정하지 않는다. 딸려온 본문(excerpt)까지 읽고 정한다.
  본문이 "(없음)" 인 기사는 제목만으로 판단한 것이다 — 확신이 낮으니
  점수를 올리지 마라.
- 재미있어 보이는 것과 나한테 쓸모 있는 것을 헷갈리지 않는다. 쓸모가 우선이다.

headline 은 **화면에 뜰 제목**이다. 원제가 영어거나 길어서 그대로는 못 쓴다.
- 한국어 **명사구**로 15~30자. 문장이 아니다. 마침표를 찍지 않는다.
- 사실 **하나만** 담는다. 쉼표로 여러 개를 잇지 마라.
- ⚠ 요약이 아니다. 목록에서 한 줄로 훑는 제목이라 길면 쓸모가 없다.
  예) \`llm-anthropic, anthropic SDK 1.0 대응\`
      \`AI 코드 리뷰 반복 횟수 400회 실측\`

topic 은 "AI 코딩", "웹 프레임워크" 처럼 **짧은 한국어 명사구**로 쓴다.
headline 은 오늘 하루를 한 문장으로 적는다. 한국어로, 과장 없이.
숫자를 부풀리거나 없는 사건을 만들지 않는다.`;

const BRIEF_SYSTEM = `당신은 개발자 한 사람을 위한 아침 브리핑을 쓴다.
뽑힌 기사의 **원문**을 받아 세 가지를 쓴다.

${INTERESTS}

- **headline** — 화면의 제목 자리에 그대로 들어간다. 큰 글씨 한 줄이다.
  (1차에서 제목만 보고 지은 표제가 이미 있다. 원문을 읽었으니 더 정확하게 고쳐 쓴다)
  · 한국어 **명사구**로 15~30자. 문장이 아니다. 마침표를 찍지 않는다.
  · 사실 **하나만** 담는다. 쉼표로 여러 개를 잇지 마라.
  · 원제를 그대로 옮기지 마라. 원제는 따로 표시된다.
  · 예) \`Next.js 긴급 보안 릴리스, 하루 앞당겨 배포\`
        \`llm-anthropic, anthropic SDK 1.0 대응\`

- **summary** — 읽고 나서 알게 된 것. **한국어 1~2문장.**
  · ⚠ **한 문장에 사실 하나만 담는다.** 접속으로 길게 잇지 마라.
    사실이 둘이면 문장을 둘로 나눈다.
  · ⚠ 한 문장 안에서 주어가 바뀌면 안 된다. 바뀌어야 하면 문장을 나눈다.
  · 제목을 바꿔 쓴 게 아니라 내용을 적는다. 원문에 없는 것을 지어내지 않는다.

- **relevance** — 이 사람에게 왜 중요한지 한 문장. 연결점이 실제로 있을 때만.
  없으면 빈 문자열로 둔다 — 억지로 갖다 붙이면 매일 같은 말이 된다.

⚠ **문체는 셋 다 '~다' 로 끝내는 평서문이다.** '~예요' · '~습니다' 를 쓰지 마라.
  화면이 이 문장들을 그대로 이어 붙이기 때문에, 어미가 섞이면 한 문단 안에서
  존댓말이 오락가락한다.

원문을 못 가져온 기사는 그렇게 적혀 있다. 그때는 제목과 피드 본문만 보고
쓰되, **아는 만큼만** 쓴다. 모르는 것을 채워 넣지 않는다. 그런 기사는
summary 가 한 문장으로 짧아도 된다.`;

function triagePrompt(items: NewsItem[]): string {
  const lines = items.map((item) => {
    const excerpt = item.excerpt ? `\n   본문: ${item.excerpt}` : "\n   본문: (없음)";
    return `[${item.id}] (${item.source}) ${item.title}${excerpt}`;
  });
  return `오늘 들어온 기사 ${items.length}건이다.\n\n${lines.join("\n\n")}`;
}

function briefPrompt(lead: NewsItem[], fetched: { id: string; text?: string }[]): string {
  const text = new Map(fetched.map((one) => [one.id, one.text]));
  const blocks = lead.map((item) => {
    const body = text.get(item.id);
    return [
      `[${item.id}] (${item.source}) ${item.title}`,
      `주소: ${item.url}`,
      body
        ? `원문:\n${body}`
        : `원문: (가져오지 못함)\n피드 본문: ${item.excerpt ?? "(없음)"}`,
    ].join("\n");
  });
  return `원문까지 읽을 ${lead.length}건이다.\n\n${blocks.join("\n\n---\n\n")}`;
}

// ── 도구(구조화 출력) ────────────────────────────────────

const PICK = {
  type: "object",
  properties: {
    id: { type: "string", description: "대괄호 안의 id 를 그대로" },
    score: {
      type: "integer",
      description: `0~100. ${FLOOR} 미만이면 이 목록에 넣지 않는다`,
    },
    headline: {
      type: "string",
      description: "화면에 뜰 한국어 표제. 명사구 15~30자. 마침표 없음",
    },
    topic: { type: "string", description: "짧은 한국어 명사구" },
  },
  required: ["id", "score", "headline", "topic"],
} as const;

const TRIAGE_TOOL = {
  name: "triage",
  description: "기사에 점수를 매긴다",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "오늘 하루를 한 문장으로" },
      picks: {
        type: "array",
        items: PICK,
        description: `${FLOOR}점 이상인 기사만. 개수를 맞추려 하지 말 것`,
      },
    },
    required: ["headline", "picks"],
  },
};

const BRIEF_TOOL = {
  name: "brief",
  description: "뽑힌 기사를 요약한다",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            headline: {
              type: "string",
              description: "제목 자리에 들어갈 한국어 명사구 15~30자. 마침표 없음",
            },
            summary: { type: "string", description: "한국어 1~2문장. 한 문장에 사실 하나" },
            relevance: {
              type: "string",
              description: "왜 중요한지 한 문장. 없으면 빈 문자열",
            },
          },
          required: ["id", "headline", "summary", "relevance"],
        },
      },
    },
    required: ["items"],
  },
};

// ── 호출 ─────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    readonly kind: "api" | "shape",
    message: string,
  ) {
    super(message);
  }
}

type Call = { input: Record<string, unknown>; usage: Usage };

async function ask(
  key: string,
  spec: { system: string; user: string; tool: object; maxTokens: number },
): Promise<Call> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": VERSION,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: spec.maxTokens,
        // 매일 같은 글이라 캐시를 건다. 반복분이 크게 싸진다.
        system: [
          {
            type: "text",
            text: spec.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [spec.tool],
        // 도구를 강제하면 JSON 파싱 실패가 아예 사라진다.
        tool_choice: { type: "tool", name: (spec.tool as { name: string }).name },
        messages: [{ role: "user", content: spec.user }],
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError("api", `Anthropic 에 닿지 못했어요 (${detail})`);
  }

  if (!response.ok) {
    // 본문에 사유가 들어 있다. 상태 코드만 남기면 화면에서 할 게 없다.
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      /* JSON 이 아니면 상태 코드만으로 말한다 */
    }
    throw new ApiError(
      "api",
      `Anthropic 응답 ${response.status}${detail ? ` · ${detail}` : ""}`,
    );
  }

  const body = (await response.json()) as {
    content?: { type: string; name?: string; input?: unknown }[];
    usage?: Record<string, number>;
    stop_reason?: string;
  };

  const block = body.content?.find((one) => one.type === "tool_use");
  if (!block || typeof block.input !== "object" || block.input === null) {
    // max_tokens 에 걸려 도구 호출이 잘리면 여기로 온다.
    throw new ApiError(
      "shape",
      `구조화된 응답을 받지 못했어요 (stop_reason: ${body.stop_reason ?? "?"})`,
    );
  }

  return {
    input: block.input as Record<string, unknown>,
    usage: {
      input: body.usage?.input_tokens ?? 0,
      output: body.usage?.output_tokens ?? 0,
      cacheWrite: body.usage?.cache_creation_input_tokens ?? 0,
      cacheRead: body.usage?.cache_read_input_tokens ?? 0,
    },
  };
}

// ── 응답 읽기 ────────────────────────────────────────────

type Pick = { id: string; score: number; headline: string; topic: string };
type Triage = { headline: string; picks: Pick[] };

/**
 * 도구를 강제해도 **id 는 모델이 적는 값이다.** 없는 id 를 지어내거나
 * 같은 것을 두 층에 넣을 수 있어서, 실제 목록과 대조해 걸러낸다.
 */
function readTriage(input: Record<string, unknown>, items: NewsItem[]): Triage {
  const known = new Set(items.map((item) => item.id));
  const taken = new Set<string>();
  const picks: Pick[] = [];

  for (const one of Array.isArray(input.picks) ? input.picks : []) {
    const id = (one as { id?: unknown })?.id;
    const raw = (one as { score?: unknown })?.score;
    const topic = (one as { topic?: unknown })?.topic;
    if (typeof id !== "string" || !known.has(id) || taken.has(id)) continue;

    const score = typeof raw === "number" ? Math.round(raw) : Number.NaN;
    /* 점수가 없거나 문턱 밑이면 버린다. 0 으로 때우면 화면에 올라온다 —
       모델이 실수로 낮은 점수를 적어 보낸 것을 통과시키면 안 된다. */
    if (!Number.isFinite(score) || score < FLOOR) continue;

    const head = (one as { headline?: unknown })?.headline;
    taken.add(id);
    picks.push({
      id,
      score: Math.min(100, Math.max(0, score)),
      // 표제에 마침표가 붙어 오면 제목 자리에서 어색하다. 조용히 떼어낸다.
      headline:
        typeof head === "string" ? head.trim().replace(/[.。]\s*$/, "") : "",
      topic: typeof topic === "string" ? topic.trim() : "",
    });
  }

  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  return { headline, picks };
}

type Brief = { id: string; headline: string; summary: string; relevance: string };

function readBrief(input: Record<string, unknown>): Brief[] {
  if (!Array.isArray(input.items)) return [];
  const out: Brief[] = [];
  for (const one of input.items) {
    const id = (one as { id?: unknown })?.id;
    if (typeof id !== "string") continue;
    const text = (key: string) => {
      const value = (one as Record<string, unknown>)[key];
      return typeof value === "string" ? value.trim() : "";
    };
    out.push({
      id,
      // 표제에 마침표가 붙어 오면 제목 자리에서 어색하다. 조용히 떼어낸다.
      headline: text("headline").replace(/[.。]\s*$/, ""),
      summary: text("summary"),
      relevance: text("relevance"),
    });
  }
  return out;
}

// ── 잡동사니 ─────────────────────────────────────────────

function empty(): Usage {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
}

function add(into: Usage, more: Usage): void {
  into.input += more.input;
  into.output += more.output;
  into.cacheWrite += more.cacheWrite;
  into.cacheRead += more.cacheRead;
}

function toFailure(error: unknown): SummarizeResult {
  if (error instanceof ApiError) {
    return { ok: false, kind: error.kind, message: error.message };
  }
  console.error("[herald] 요약 실패:", error);
  return { ok: false, kind: "api", message: "알 수 없는 오류가 났어요" };
}
