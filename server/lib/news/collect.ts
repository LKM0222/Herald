import { XMLParser } from "fast-xml-parser";
import { CATALOG, type SourceInfo } from "@shared/sources";
import type { NewsItem } from "@shared/types";
import { resolveOrigins, type OriginReport } from "./origin";
import { idFor } from "./url";

/**
 * RSS · Atom 수집.
 *
 * ⚠ 이 파일은 **토큰을 한 톨도 쓰지 않는다.** 요약(Claude)과 완전히 갈라둔다 —
 *   한 함수에 두면 "뉴스 좀 볼까" 가 매번 과금이 된다.
 *
 * 실제로 열 개 피드를 받아보고 정한 것들:
 *
 *   · **날짜로 먼저 자른다.** OpenAI 피드는 1,144건, Hugging Face 는 847건을
 *     준다 — 최근 것만 주는 게 아니라 전체 아카이브다. 안 자르면 하루치(69건)의
 *     30배가 들어온다. 요약 단계에서 토큰이 사라진다면 여기서 사라진다.
 *   · **본문은 잘라서 담는다.** Simon Willison 은 글 전문을 실어 보낸다
 *     (30건에 41,856자). 원문 크롤링은 아예 안 한다.
 *   · **상한에 걸리면 소스별로 돌아가며 고른다.** 최신순으로 자르면 그날
 *     시끄러웠던 한 곳이 상한을 다 먹고, 하루 한 건뿐인 1차 발표가 잘려나간다.
 */

const TIMEOUT_MS = 15_000;
const AGENT = "Herald/0.1 (+https://github.com/LKM0222/Herald)";

/**
 * 피드 본문에서 가져갈 최대 길이. 요약에 넣을 재료지 읽을 글이 아니다.
 *
 * 400 자였을 때 실제로 걸린 건 Simon Willison 4건뿐이었다(원본 578~1315자).
 * 나머지는 피드가 제 손으로 더 짧게 잘라 보낸다 — GeekNews 는 53~208자,
 * Hacker News 는 8자(댓글 링크뿐)다. 1500 으로 올려도 하루 총량이
 * 1,827자 늘 뿐이라 굳이 문장을 자를 이유가 없다.
 */
const EXCERPT_MAX = 1500;

/**
 * 발췌가 이보다 짧으면 없는 것으로 친다.
 *
 * ⚠ **빈 발췌보다 쓸모없는 발췌가 나쁘다.** Hacker News 피드는 description 에
 *   댓글 링크만 넣어 보내서 걷어내면 `Comments` 여덟 글자가 남는다. 30건 전부
 *   그렇다. 그대로 두면 판단 프롬프트에 `본문: Comments` 로 들어가고, 모델은
 *   그걸 본문으로 취급한다 — 제목만 보고 정한다는 사실을 모르게 된다.
 *
 *   실측 하한은 GeekNews 53자, Simon Willison 584자다. 20자는 그 아래로
 *   한참 여유가 있어 진짜 본문을 자르지 않는다.
 */
const EXCERPT_MIN = 20;

/**
 * 하루치 전체 상한.
 *
 * ⚠ 소스마다 고정 상한을 두지 않는다. 예전엔 소스당 30건으로 잘랐는데,
 *   전체가 63건일 때도 GeekNews 20건이 버려졌다 — 아무도 밀어내지 않는데
 *   버린 것이다. 상한은 **전체가 넘칠 때만** 돈다.
 */
const TOTAL_MAX = 120;

/**
 * caldav.ts 와 같은 설정을 쓴다.
 * parseTagValue:false — "2026-08-25" 같은 값이 숫자로 뭉개지지 않게.
 */
const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
});

/** 소스 하나의 수집 결과. 왜 비었는지가 보여야 한다. */
export type SourceReport = {
  id: string;
  name: string;
  ok: boolean;
  /** 피드가 준 전체 건수 */
  total: number;
  /** 기간 안에 들어온 건수 */
  fresh: number;
  /** 날짜를 못 읽은 건수. 조용히 버리면 소스가 통째로 사라진 걸 모른다 */
  undated: number;
  /** 전체 상한에 걸려 이 소스에서 잘린 건수. 평소엔 0 이다 */
  trimmed: number;
  ms: number;
  error?: string;
};

export type CollectResult = {
  items: NewsItem[];
  reports: SourceReport[];
  /** 전체 상한에 걸려 잘린 건수 */
  dropped: number;
  /** 같은 기사라 합친 건수. 0 이 아니면 원본 주소 복원이 일하고 있다는 뜻이다 */
  merged: number;
  /** 원본 주소 복원 결과 */
  origins: OriginReport;
};

export type CollectOptions = {
  /** 켜져 있는 소스 id. 비어 있으면 아무것도 안 한다 */
  enabled: string[];
  /** 이 시간 안에 나온 것만. 기본 24시간 */
  hours?: number;
};

export async function collect(options: CollectOptions): Promise<CollectResult> {
  const hours = options.hours ?? 24;
  const cutoff = Date.now() - hours * 3600_000;

  const sources = CATALOG.filter((source) =>
    options.enabled.includes(source.id),
  );

  // 한 곳이 느리다고 나머지를 기다리게 하지 않는다.
  const settled = await Promise.all(
    sources.map((source) => fetchOne(source, cutoff)),
  );

  const reports = settled.map((one) => one.report);

  /* ⚠ 순서가 중요하다. 원본 주소를 먼저 되찾아야 중복 비교가 성립한다.
     GeekNews 는 자기 주소만 주기 때문에, 이 줄이 없으면 Hacker News 와
     같은 기사가 나란히 살아남는다 (origin.ts 참고). */
  const raw = settled.flatMap((one) => one.items);
  const { items: restored, report: origins } = await resolveOrigins(raw);

  const merged = dedupe(restored);
  merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const items = merged.length <= TOTAL_MAX ? merged : ration(merged);

  // 어느 소스가 얼마나 잘렸는지 남긴다. 총 몇 건 버렸다고만 하면
  // 한 소스가 통째로 사라진 것을 알 수 없다.
  const kept = new Set(items.map((item) => item.id));
  for (const report of reports) {
    report.trimmed = merged.filter(
      (item) => item.source === report.name && !kept.has(item.id),
    ).length;
  }

  return {
    items,
    reports,
    dropped: merged.length - items.length,
    merged: restored.length - merged.length,
    origins,
  };
}

type One = { items: NewsItem[]; report: SourceReport };

/**
 * 상한을 넘었을 때 소스별로 돌아가며 고른다.
 *
 * 그냥 최신순으로 자르면 그날 시끄러웠던 한 곳이 상한을 다 먹고 조용한 곳이
 * 통째로 빠진다. 1차 발표(OpenAI · GitHub)는 하루 한 건인데 그 한 건이
 * 잘려나가는 게 제일 아프다.
 */
function ration(items: NewsItem[]): NewsItem[] {
  const queues = new Map<string, NewsItem[]>();
  for (const item of items) {
    const queue = queues.get(item.source);
    if (queue) queue.push(item);
    else queues.set(item.source, [item]);
  }

  const out: NewsItem[] = [];
  while (out.length < TOTAL_MAX) {
    let moved = false;
    for (const queue of queues.values()) {
      const next = queue.shift();
      if (!next) continue;
      out.push(next);
      moved = true;
      if (out.length >= TOTAL_MAX) break;
    }
    if (!moved) break; // 다 꺼냈다
  }

  out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return out;
}

async function fetchOne(source: SourceInfo, cutoff: number): Promise<One> {
  const started = Date.now();
  const base: SourceReport = {
    id: source.id,
    name: source.name,
    ok: false,
    total: 0,
    fresh: 0,
    undated: 0,
    trimmed: 0,
    ms: 0,
  };

  let xml: string;
  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        items: [],
        report: { ...base, ms: Date.now() - started, error: `HTTP ${response.status}` },
      };
    }
    xml = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { items: [], report: { ...base, ms: Date.now() - started, error: detail } };
  }

  let entries: Record<string, unknown>[];
  try {
    entries = readEntries(xml);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      items: [],
      report: { ...base, ms: Date.now() - started, error: `파싱 실패: ${detail}` },
    };
  }

  let undated = 0;
  const fresh: NewsItem[] = [];

  for (const entry of entries) {
    const published = when(entry);
    if (published === null) {
      undated += 1;
      continue;
    }
    if (published.getTime() < cutoff) continue;

    const item = toItem(entry, source, published);
    if (item) fresh.push(item);
  }

  fresh.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    items: fresh,
    report: {
      ...base,
      ok: true,
      total: entries.length,
      fresh: fresh.length,
      undated,
      // 자르는 건 전체를 본 뒤에 정한다 (collect 참고).
      trimmed: 0,
      ms: Date.now() - started,
    },
  };
}

/** RSS 의 item 이든 Atom 의 entry 든 한 모양으로 꺼낸다. */
function readEntries(xml: string): Record<string, unknown>[] {
  const doc = parser.parse(xml) as Record<string, unknown>;

  const rss = doc.rss as { channel?: unknown } | undefined;
  const channel = rss?.channel as { item?: unknown } | undefined;
  if (channel?.item) return many(channel.item);

  // RDF (구형 RSS 1.0) 는 item 이 최상위에 온다.
  const rdf = doc.RDF as { item?: unknown } | undefined;
  if (rdf?.item) return many(rdf.item);

  const feed = doc.feed as { entry?: unknown } | undefined;
  if (feed?.entry) return many(feed.entry);

  return [];
}

/** fast-xml-parser 는 항목이 하나면 배열을 벗겨서 준다. */
function many(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return value ? [value as Record<string, unknown>] : [];
}

/**
 * ⚠ 속성이 붙은 요소는 문자열이 아니라 객체로 파싱된다.
 *   Atom 의 <title type="html"> 이 그렇다 — 문자열만 받으면 제목이 통째로 사라진다.
 *   (CalDAV 에서 일정 39건을 0건으로 읽었던 것과 같은 함정이다)
 */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  const text = (value as { "#text"?: unknown } | null)?.["#text"];
  return typeof text === "string" ? text : "";
}

function when(entry: Record<string, unknown>): Date | null {
  const raw =
    textOf(entry.pubDate) ||
    textOf(entry.published) ||
    textOf(entry.updated) ||
    textOf(entry.date) || // RDF 는 dc:date → removeNSPrefix 로 date 가 된다
    "";
  if (!raw) return null;
  const at = new Date(raw.trim());
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Atom 의 link 는 요소가 아니라 속성(@href)이고, 여러 개가 올 수 있다.
 * rel 이 없거나 alternate 인 것이 사람이 볼 주소다 — replies·edit 를 집으면 안 된다.
 */
function linkOf(entry: Record<string, unknown>): string {
  const direct = textOf(entry.link);
  if (direct) return direct.trim();

  for (const link of many(entry.link)) {
    const rel = String(link["@rel"] ?? "alternate");
    const href = link["@href"];
    if (rel === "alternate" && typeof href === "string") return href.trim();
  }
  // guid 가 주소인 피드가 있다 (isPermaLink).
  const guid = textOf(entry.guid) || textOf(entry.id);
  return /^https?:\/\//.test(guid) ? guid.trim() : "";
}

function toItem(
  entry: Record<string, unknown>,
  source: SourceInfo,
  published: Date,
): NewsItem | null {
  const title = clean(textOf(entry.title));
  const url = linkOf(entry);
  // 제목이나 주소가 없으면 화면에서 할 수 있는 게 없다.
  if (!title || !url) return null;

  const raw = clean(
    textOf(entry.description) ||
      textOf(entry.summary) ||
      textOf(entry.content) ||
      textOf(entry.encoded), // content:encoded
  ).slice(0, EXCERPT_MAX);
  // 짧은 건 본문이 아니라 피드의 껍데기다 (EXCERPT_MIN 참고).
  const excerpt = raw.length >= EXCERPT_MIN ? raw : "";

  return {
    id: idFor(url),
    title,
    url,
    source: source.name,
    publishedAt: published.toISOString(),
    ...(excerpt ? { excerpt } : {}),
  };
}

/** 태그·엔티티를 걷어내고 공백을 접는다. 피드 본문은 대개 HTML 이다. */
function clean(raw: string): string {
  return decode(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith("#")) {
      const point = code.startsWith("#x")
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * 같은 기사를 묶는다.
 *
 * 주소가 같으면 한 건으로 합치고, 제목이 똑같으면 alsoIn 으로 달아둔다.
 * 비슷한 제목을 억지로 묶지 않는다 — 다른 사건을 하나로 뭉치는 쪽이
 * 중복을 남기는 것보다 나쁘다. 판단이 필요한 묶음은 요약 단계 몫이다.
 */
function dedupe(items: NewsItem[]): NewsItem[] {
  const byId = new Map<string, NewsItem>();
  for (const item of items) {
    const seen = byId.get(item.id);
    if (!seen) {
      byId.set(item.id, { ...item });
      continue;
    }
    byId.set(item.id, keepBetter(seen, item));
  }

  const byTitle = new Map<string, NewsItem>();
  const out: NewsItem[] = [];
  for (const item of byId.values()) {
    const key = titleKey(item.title);
    const seen = key ? byTitle.get(key) : undefined;
    if (seen) {
      const winner = keepBetter(seen, item);
      // 자리를 그대로 두고 내용만 바꿔치운다 — 정렬은 나중에 다시 한다.
      Object.assign(seen, winner);
      continue;
    }
    if (key) byTitle.set(key, item);
    out.push(item);
  }
  return out;
}

/**
 * 같은 기사가 두 소스에서 왔을 때 **어느 쪽을 남길지.**
 *
 * 먼저 본 쪽이 아니라 **발췌가 긴 쪽**을 남긴다. 판단 재료가 많은 쪽이기 때문이다.
 * 실제로 이게 갈린다 — Apple 발표를 GeekNews 는 한국어 요약 155자로 주고
 * Hacker News 는 발췌 없이 준다. 먼저 본 쪽을 남기면 소스 목록 순서라는
 * 아무 상관 없는 이유로 재료가 사라진다.
 *
 * 진 쪽은 alsoIn 에 남아 화면에서 눌러 갈 수 있다.
 */
function keepBetter(a: NewsItem, b: NewsItem): NewsItem {
  const [win, lose] = (b.excerpt?.length ?? 0) > (a.excerpt?.length ?? 0)
    ? [b, a]
    : [a, b];
  return {
    ...win,
    alsoIn: [
      ...(win.alsoIn ?? []),
      { source: lose.source, url: lose.url },
      ...(lose.alsoIn ?? []),
    ],
  };
}

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 80);
}
