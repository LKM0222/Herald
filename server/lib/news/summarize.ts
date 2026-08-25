import type { NewsItem, Priority } from "@shared/types";
import { getSecret } from "../secrets";
import { fetchArticles } from "./article";
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

/** 먼저 볼 것의 개수. 너무 적으면 브리핑이 비고, 많으면 고른 의미가 없다. */
const LEAD_MAX = 8;

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
    return { ok: true, news: [], headline: "", usage: empty(), notes: [] };
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
  const lead = triage.lead
    .map((pick) => byId.get(pick.id))
    .filter((item): item is NewsItem => item !== undefined)
    .slice(0, LEAD_MAX);

  const topics = new Map(
    [...triage.lead, ...triage.skim].map((pick) => [pick.id, pick.topic]),
  );
  const skimIds = new Set(triage.skim.map((pick) => pick.id));
  const leadIds = new Set(lead.map((item) => item.id));

  // ── 2차 · 먼저 볼 것만 원문으로 ────────────────────────
  const deep = new Map<string, { summary: string; relevance: string }>();

  if (lead.length > 0) {
    const fetched = await fetchArticles(lead);
    for (const one of fetched) {
      if (one.error) {
        const title = byId.get(one.id)?.title ?? one.id;
        notes.push(`원문 못 가져옴 · ${title} (${one.error})`);
      }
    }

    try {
      const call = await ask(key, {
        system: BRIEF_SYSTEM,
        user: briefPrompt(lead, fetched),
        tool: BRIEF_TOOL,
        maxTokens: 4_000,
      });
      add(usage, call.usage);
      for (const one of readBrief(call.input)) {
        deep.set(one.id, { summary: one.summary, relevance: one.relevance });
      }
    } catch (error) {
      // 2차가 실패해도 1차 판단은 살린다. 층이라도 나뉜 채로 저장하는 게
      // 아무것도 없는 것보다 낫다 — 실패를 이유로 하루치를 통째로 버리지 않는다.
      const detail = error instanceof Error ? error.message : String(error);
      notes.push(`먼저 볼 것 요약 실패 · ${detail}`);
    }
  }

  const news = items.map((item) => {
    const priority: Priority = leadIds.has(item.id)
      ? 1
      : skimIds.has(item.id)
        ? 2
        : 3;
    const topic = topics.get(item.id);
    const detail = deep.get(item.id);
    return {
      ...item,
      priority,
      ...(topic ? { topic } : {}),
      ...(detail?.summary ? { summary: detail.summary } : {}),
      ...(detail?.relevance ? { relevance: detail.relevance } : {}),
    };
  });

  return { ok: true, news, headline: triage.headline, usage, notes };
}

// ── 프롬프트 ─────────────────────────────────────────────

const TRIAGE_SYSTEM = `당신은 개발자 한 사람을 위한 아침 브리핑을 만든다.
하루치 기사 목록을 받아 **무엇을 먼저 볼지** 정하는 것이 일이다.

${INTERESTS}

층은 셋이다:
- 먼저 볼 것 (lead): 최대 ${LEAD_MAX}건. 오늘 이것만 봐도 되는 것.
  억지로 채우지 않는다. 쓸 만한 게 셋뿐이면 셋만 넣는다.
- 훑어볼 것 (skim): 제목과 링크만 보여줄 것. 들어가 읽을지는 사람이 정한다.
  여기도 무한정 넣지 않는다 — 목록이 길어지면 고른 의미가 없다.
- 나머지: 아무 데도 넣지 않는다. 자동으로 참고 층으로 내려간다.

topic 은 "AI 코딩", "웹 프레임워크" 처럼 **짧은 한국어 명사구**로 쓴다.
headline 은 오늘 하루를 한 문장으로 적는다. 한국어로, 과장 없이.
숫자를 부풀리거나 없는 사건을 만들지 않는다.`;

const BRIEF_SYSTEM = `당신은 개발자 한 사람을 위한 아침 브리핑을 쓴다.
먼저 볼 것으로 뽑힌 기사의 **원문**을 받아 두 가지를 쓴다.

${INTERESTS}

- summary: 기사 내용을 한국어 한 문장으로. 제목을 바꿔 쓴 게 아니라
  **읽고 나서 알게 된 것**을 적는다. 원문에 없는 내용을 지어내지 않는다.
- relevance: 이 사람에게 왜 중요한지 한 문장. 연결점이 실제로 있을 때만 쓴다.
  없으면 빈 문자열로 둔다 — 억지로 갖다 붙이면 매일 같은 말이 된다.

원문을 못 가져온 기사는 그렇게 적혀 있다. 그때는 제목과 피드 본문만 보고
쓰되, **아는 만큼만** 쓴다. 모르는 것을 채워 넣지 않는다.`;

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
  return `먼저 볼 것으로 뽑힌 ${lead.length}건이다.\n\n${blocks.join("\n\n---\n\n")}`;
}

// ── 도구(구조화 출력) ────────────────────────────────────

const PICK = {
  type: "object",
  properties: {
    id: { type: "string", description: "대괄호 안의 id 를 그대로" },
    topic: { type: "string", description: "짧은 한국어 명사구" },
  },
  required: ["id", "topic"],
} as const;

const TRIAGE_TOOL = {
  name: "triage",
  description: "기사를 층으로 나눈다",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "오늘 하루를 한 문장으로" },
      lead: { type: "array", items: PICK, description: `먼저 볼 것. 최대 ${LEAD_MAX}건` },
      skim: { type: "array", items: PICK, description: "훑어볼 것" },
    },
    required: ["headline", "lead", "skim"],
  },
};

const BRIEF_TOOL = {
  name: "brief",
  description: "먼저 볼 것을 요약한다",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            summary: { type: "string", description: "한국어 한 문장" },
            relevance: {
              type: "string",
              description: "왜 중요한지 한 문장. 없으면 빈 문자열",
            },
          },
          required: ["id", "summary", "relevance"],
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

type Pick = { id: string; topic: string };
type Triage = { headline: string; lead: Pick[]; skim: Pick[] };

/**
 * 도구를 강제해도 **id 는 모델이 적는 값이다.** 없는 id 를 지어내거나
 * 같은 것을 두 층에 넣을 수 있어서, 실제 목록과 대조해 걸러낸다.
 */
function readTriage(input: Record<string, unknown>, items: NewsItem[]): Triage {
  const known = new Set(items.map((item) => item.id));
  const taken = new Set<string>();

  const picks = (value: unknown): Pick[] => {
    if (!Array.isArray(value)) return [];
    const out: Pick[] = [];
    for (const one of value) {
      const id = (one as { id?: unknown })?.id;
      const topic = (one as { topic?: unknown })?.topic;
      if (typeof id !== "string" || !known.has(id) || taken.has(id)) continue;
      taken.add(id);
      out.push({ id, topic: typeof topic === "string" ? topic.trim() : "" });
    }
    return out;
  };

  // lead 를 먼저 읽는다 — 양쪽에 있으면 위층이 이긴다.
  const lead = picks(input.lead);
  const skim = picks(input.skim);
  const headline = typeof input.headline === "string" ? input.headline.trim() : "";

  return { headline, lead, skim };
}

function readBrief(
  input: Record<string, unknown>,
): { id: string; summary: string; relevance: string }[] {
  if (!Array.isArray(input.items)) return [];
  const out: { id: string; summary: string; relevance: string }[] = [];
  for (const one of input.items) {
    const id = (one as { id?: unknown })?.id;
    if (typeof id !== "string") continue;
    const summary = (one as { summary?: unknown })?.summary;
    const relevance = (one as { relevance?: unknown })?.relevance;
    out.push({
      id,
      summary: typeof summary === "string" ? summary.trim() : "",
      relevance: typeof relevance === "string" ? relevance.trim() : "",
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
