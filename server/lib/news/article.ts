import type { NewsItem } from "@shared/types";
import { imageFromHtml } from "./image";

/**
 * 원문 가져오기.
 *
 * ⚠ **먼저 볼 것으로 뽑힌 몇 건에만 쓴다.** 전부 가져오면 어떻게 되는지
 *   실제로 재봤다 — 83건 평균 4,391자, 합쳐서 364,453자(약 91,000 토큰)다.
 *   피드만 쓸 때(약 2,400 토큰)의 38배다. 매일.
 *
 * 안 읽을 75건에 원문을 붙이는 건 낭비다. Herald 가 하는 일은
 * **뭘 읽을지 골라주는 것**이지 읽기를 대신하는 게 아니다.
 *
 * 실패해도 요약은 계속된다. 원문을 못 가져오면 피드 본문으로 요약한다 —
 * 14건 중 1건은 403 이었고, 앞으로도 그럴 것이다.
 */

const TIMEOUT_MS = 12_000;

/** 브라우저인 척하지 않되 정체는 밝힌다. 막는 곳은 막히는 대로 둔다. */
const AGENT =
  "Mozilla/5.0 (compatible; Herald/0.1; +https://github.com/LKM0222/Herald)";

/**
 * 한 기사에서 가져갈 최대 길이.
 *
 * 실측 평균이 4,391자였고 긴 것은 16,000자를 넘었다(댓글·사이드바가 섞인다).
 * 요약 한 줄과 "왜 중요한가" 한 줄을 쓰는 데 그만큼이 필요하지 않다.
 */
const MAX_CHARS = 6_000;

/** 동시에 몇 개까지. 상대 서버에 몰아치지 않으려는 것이다. */
const CONCURRENCY = 3;

export type Fetched = {
  id: string;
  /** 본문. 실패하면 없다 */
  text?: string;
  /**
   * 원문이 내건 대표 이미지(og:image).
   *
   * ⚠ **요청이 하나도 안 는다.** 어차피 받는 HTML 을 한 번 더 훑을 뿐이다.
   *   개발 소스는 피드에 이미지가 아예 없어서(GeekNews·Hacker News·OpenAI·
   *   Next.js·Hugging Face 전부 0건) 여기가 사실상 유일한 경로다.
   */
  image?: string;
  /** 왜 못 가져왔는지. 성공하면 없다 */
  error?: string;
};

export async function fetchArticles(items: NewsItem[]): Promise<Fetched[]> {
  const out: Fetched[] = [];
  // 몇 건 안 되니 단순한 묶음 처리로 충분하다.
  for (let at = 0; at < items.length; at += CONCURRENCY) {
    const batch = items.slice(at, at + CONCURRENCY);
    out.push(...(await Promise.all(batch.map(fetchOne))));
  }
  return out;
}

async function fetchOne(item: NewsItem): Promise<Fetched> {
  try {
    const response = await fetch(item.url, {
      headers: { "User-Agent": AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) {
      return { id: item.id, error: `HTTP ${response.status}` };
    }

    // HTML 이 아니면(PDF · 영상 · 이미지) 읽어봐야 쓰레기가 나온다.
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) {
      return { id: item.id, error: `본문이 아님 (${type.split(";")[0] || "형식 불명"})` };
    }

    const html = await response.text();
    /* 이미지는 본문보다 먼저 꺼낸다 — 본문이 짧아 실패로 처리되는 페이지에도
       og:image 는 멀쩡히 있다. 리다이렉트를 따라갔을 수 있으니 최종 주소를
       기준으로 상대경로를 편다. */
    const image = imageFromHtml(html, response.url || item.url);

    const text = readable(html);
    if (text.length < 200) {
      // 자바스크립트로 그리는 페이지는 껍데기만 온다. 억지로 쓰지 않는다.
      return { id: item.id, error: "본문을 찾지 못함", ...(image ? { image } : {}) };
    }
    return {
      id: item.id,
      text: text.slice(0, MAX_CHARS),
      ...(image ? { image } : {}),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { id: item.id, error: detail };
  }
}

/**
 * HTML 에서 읽을 만한 글만 남긴다.
 *
 * 본격적인 본문 추출기(readability)를 넣지 않았다. 요약에 넣을 재료라
 * 문단 순서가 조금 흐트러져도 되고, 의존성 하나를 아끼는 편이 낫다.
 * 대신 확실히 글이 아닌 것(스크립트 · 내비 · 푸터 · 댓글)은 먼저 걷어낸다.
 */
function readable(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|nav|footer|header|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    // 문단·제목 경계는 줄바꿈으로 남긴다. 안 그러면 문장이 서로 붙는다.
    .replace(/<\/(p|div|section|article|li|h[1-6]|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decode(stripped)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    // 메뉴·버튼 같은 토막은 버린다. 문장은 대개 이보다 길다.
    .filter((line) => line.length > 30)
    .join("\n")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
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
