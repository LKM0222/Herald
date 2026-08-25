import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NewsItem } from "@shared/types";
import { idFor } from "./url";

/**
 * 모아주는 사이트가 가린 **원본 주소**를 되찾는다.
 *
 * ⚠ 토큰을 쓰지 않는다. HTTP 요청만 한다.
 *
 * GeekNews 피드는 원본 주소를 아예 주지 않는다 — 원문 XML 을 확인해 보면
 * <link> 도 <id> 도 전부 news.hada.io/topic?id=... 이다. 실제 데이터로 재보니
 * 이것 하나 때문에 두 가지가 동시에 망가져 있었다:
 *
 *   1. **중복이 안 잡힌다.** 같은 기사가 GeekNews 와 Hacker News 로 두 번
 *      들어와도 주소가 다르고(news.hada.io vs apple.com) 제목도 다르다
 *      (GeekNews 가 한국어로 옮겨서). 두 방어선을 나란히 빠져나간다.
 *      2026-08-25 실측 84건 중 최소 5쌍이 이렇게 새어 나갔다.
 *   2. **원문 대신 요약을 읽는다.** article.ts 가 news.hada.io 를 크롤링하면
 *      원문이 아니라 GeekNews 가 쓴 한국어 요약을 긁는다. 요약의 요약이 된다.
 *
 * 토픽 페이지에는 원본이 있다 — <a class='... topic-title-link' href='원본'>.
 * 한 번 정해지면 안 바뀌므로 캐시해 둔다. 다음 날부터는 새 글 몇 건만 요청한다.
 */

const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const FILE = path.join(DATA_DIR, "news-origins.json");

/** 캐시를 얼마나 들고 있을지. 창(48시간)보다 훨씬 길게 잡아 재요청을 줄인다. */
const KEEP_DAYS = 90;

const TIMEOUT_MS = 8_000;

/**
 * 동시에 몇 개까지, 묶음 사이에 얼마나 쉴지.
 *
 * ⚠ 처음엔 5개씩 쉬지 않고 보냈다가 **50건 중 뒤쪽 11건이 통째로 실패**했다.
 *   하나씩 열어보면 전부 200 이라 페이지 문제가 아니라 연속 요청이 막힌 것이다.
 *   캐시가 있어서 이 부담은 첫 실행에만 온다 — 그 뒤로는 새 글 몇 건뿐이라
 *   느리게 가도 손해가 없다. 빠른 쪽이 아니라 안 막히는 쪽을 고른다.
 */
const CONCURRENCY = 3;
const PAUSE_MS = 250;

/** 막혀서 실패한 것을 한 번 더 물어본다. 그때는 더 천천히 간다. */
const RETRY_PAUSE_MS = 1_500;

const AGENT = "Herald/0.1 (+https://github.com/LKM0222/Herald)";

/**
 * 원본을 가리는 사이트들.
 *
 * 지금은 GeekNews 하나뿐이다. Lobsters·Reddit 처럼 같은 구조를 쓰는 곳을
 * 나중에 붙일 자리라 목록으로 뒀다.
 */
const HIDERS: Hider[] = [
  {
    host: "news.hada.io",
    /* 제목에 걸린 링크가 원본이다. 본문 속 링크(참고 자료 · HN 토론 링크)를
       집으면 엉뚱한 글을 원본으로 삼는다 — 실제로 토픽 페이지 하나에
       developer.apple.com 링크가 셋, HN 링크가 하나 더 있었다.
       class 로 정확히 짚는다. 속성 순서에 기대지 않는다. */
    find: (html) => /<a\s[^>]*topic-title-link[^>]*>/i.exec(html)?.[0] ?? null,
  },
];

type Hider = {
  host: string;
  find: (html: string) => string | null;
};

export type OriginReport = {
  /** 원본을 찾아 주소를 바꾼 건수 */
  resolved: number;
  /** 캐시로 해결한 건수. 요청을 안 보낸 것들이다 */
  cached: number;
  /**
   * 원본이 아예 없는 글. 실패가 아니다 —
   * "Show GN" 처럼 GeekNews 에 직접 쓴 글은 가리킬 원본이 없다.
   */
  selfPost: number;
  /** 두 번 물어보고도 못 읽은 건수. 그대로 두고 넘어간다 */
  failed: number;
  ms: number;
};

/**
 * 원본 주소를 되찾아 items 를 새로 만든다.
 *
 * ⚠ 주소가 바뀌면 **id 도 다시 매긴다.** 안 그러면 중복 비교가 옛 주소로 돌아
 *   되찾은 의미가 없다. 대신 그 항목의 옛 id 는 seen.ts 기록과 어긋나므로
 *   도입 직후 한 번은 GeekNews 기사가 다시 요약 대상이 될 수 있다.
 *
 * 못 찾으면 원래 주소를 그대로 둔다. 실패가 수집을 막지 않는다.
 */
export async function resolveOrigins(
  items: NewsItem[],
): Promise<{ items: NewsItem[]; report: OriginReport }> {
  const started = Date.now();
  const report: OriginReport = {
    resolved: 0,
    cached: 0,
    selfPost: 0,
    failed: 0,
    ms: 0,
  };

  const targets = items.filter((item) => hiderFor(item.url) !== undefined);
  if (targets.length === 0) {
    report.ms = Date.now() - started;
    return { items, report };
  }

  const cache = read();
  const found = new Map<string, string>();
  const misses: NewsItem[] = [];

  for (const item of targets) {
    const hit = cache[item.url];
    if (hit) {
      found.set(item.url, hit.url);
      report.cached += 1;
      // 다시 봤으니 만료 시계를 미룬다.
      hit.at = today();
    } else {
      misses.push(item);
    }
  }

  const stubborn = await sweep(misses, PAUSE_MS, found, cache, report);
  // 막혀서 떨어진 것들만 한 번 더. 원본이 없는 글(자체 글)은 여기 안 온다.
  const lost = await sweep(stubborn, RETRY_PAUSE_MS, found, cache, report);

  report.failed = lost.length;
  if (misses.length > 0) save(cache);

  const next = items.map((item) => {
    const origin = found.get(item.url);
    if (!origin || origin === item.url) return item;
    report.resolved += 1;
    return {
      ...item,
      id: idFor(origin),
      url: origin,
      /* 원본으로 바꾸면 GeekNews 토론 페이지로 가는 길이 끊긴다.
         alsoIn 에 남겨 화면에서 여전히 눌러 갈 수 있게 한다. */
      alsoIn: [...(item.alsoIn ?? []), { source: item.source, url: item.url }],
    };
  });

  report.ms = Date.now() - started;
  return { items: next, report };
}

/**
 * 한 바퀴 돌면서 원본을 물어본다. **다시 물어볼 것만** 돌려준다.
 *
 * 원본이 없는 글(자체 글)은 다시 물어봐도 답이 같으므로 캐시에 박아두고 뺀다 —
 * 그래야 재시도가 진짜 막힌 것들만 상대한다.
 */
async function sweep(
  items: NewsItem[],
  pauseMs: number,
  found: Map<string, string>,
  cache: Stored,
  report: OriginReport,
): Promise<NewsItem[]> {
  const again: NewsItem[] = [];

  for (let at = 0; at < items.length; at += CONCURRENCY) {
    const batch = items.slice(at, at + CONCURRENCY);
    const results = await Promise.all(batch.map((item) => lookup(item.url)));

    for (let i = 0; i < batch.length; i += 1) {
      const item = batch[i];
      const result = results[i];
      if (result.kind === "found") {
        found.set(item.url, result.url);
        cache[item.url] = { url: result.url, at: today() };
      } else if (result.kind === "none") {
        report.selfPost += 1;
        // 자기 자신을 원본으로 적어둔다. 바꿀 게 없다는 뜻이자 다시 안 묻겠다는 뜻이다.
        cache[item.url] = { url: item.url, at: today() };
      } else {
        again.push(item);
      }
    }

    if (at + CONCURRENCY < items.length) await rest(pauseMs);
  }

  return again;
}

function rest(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function hiderFor(url: string): Hider | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return HIDERS.find((one) => host === one.host);
  } catch {
    return undefined;
  }
}

/**
 * "못 읽었다" 와 "원본이 없다" 를 갈라 돌려준다.
 *
 * 둘을 뭉뚱그리면 재시도가 자체 글까지 다시 긁어 남의 서버를 괜히 두들기고,
 * 보고에는 실패 11건이 찍혀 진짜 문제가 있는 것처럼 보인다.
 */
type Lookup =
  | { kind: "found"; url: string }
  | { kind: "none" }
  | { kind: "error" };

async function lookup(url: string): Promise<Lookup> {
  const hider = hiderFor(url);
  if (!hider) return { kind: "none" };

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok) return { kind: "error" };

    const tag = hider.find(await response.text());
    // 페이지는 읽었는데 제목 링크가 없다 = 원본이 없는 글이다.
    if (!tag) return { kind: "none" };

    const href = /href=['"]([^'"]+)['"]/i.exec(tag)?.[1];
    if (!href || !/^https?:\/\//i.test(href)) return { kind: "none" };

    // 자기 사이트를 가리켜도 원본이 없는 글이다.
    return hiderFor(href) ? { kind: "none" } : { kind: "found", url: href.trim() };
  } catch {
    return { kind: "error" };
  }
}

/** 토픽 주소 → 원본 주소. at 은 마지막으로 본 날(YYYY-MM-DD) */
type Stored = Record<string, { url: string; at: string }>;

function read(): Stored {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Stored)
      : {};
  } catch {
    // 파일 없음 = 첫 실행. 오류가 아니라 상태다.
    return {};
  }
}

function save(cache: Stored): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(prune(cache), null, 2));
  } catch {
    /* 캐시는 있으면 좋은 것이다. 못 써도 수집은 계속된다 — 다음에 다시 물어볼 뿐이다. */
  }
}

function prune(cache: Stored): Stored {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const out: Stored = {};
  for (const [key, value] of Object.entries(cache)) {
    if (value.at >= cutoff) out[key] = value;
  }
  return out;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
