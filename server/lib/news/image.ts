/**
 * 기사 대표 이미지 찾기.
 *
 * ⚠ **한 장도 만들어내지 않는다. 이미 있는 것만 꺼낸다.**
 *   생성 모델(나노바나나 · Grok)을 붙이기 전에 재봤더니, 피드 30곳 중 대부분이
 *   이미 이미지를 실어 보내고 있었다 — 연합뉴스 120/120, SBS 29/29, 인벤 25/25,
 *   GamesIndustry 100/100, 게임메카·루리웹 100%. 그걸 우리가 안 읽고 버리고
 *   있었을 뿐이다. 없는 건 개발 소스(GeekNews · Hacker News · OpenAI · Next.js ·
 *   Hugging Face 전부 0)와 미국 경제 셋, 경향신문이다.
 *
 *   생성은 장당 $0.02~0.13 이라 하루 열 장이면 한 달 $6~40 이다. 지금 요약
 *   전체가 한 달 $0.6 안팎인 걸 생각하면 본체의 열 배가 넘는다. 아래 세 경로를
 *   다 쓰고도 로고만 뜨는 게 몇 건인지 세어 본 다음에 정할 일이다.
 *
 * 값싼 순서대로 찾는다:
 *
 *   1. 피드가 실어 보낸 것      — 공짜. 이미 받은 XML 안에 있다
 *   2. 원문의 og:image          — 공짜. 1층은 어차피 원문을 받는다 (article.ts)
 *   3. GitHub 아바타            — 공짜. 개발 기사 상당수가 특정 저장소 이야기다
 *   4. (없으면 비운다)          — 화면이 로고를 대신 그린다 (NewsImage.tsx)
 */

/** 추적 픽셀과 아이콘을 거른다. 이보다 작은 건 대표 이미지가 아니다 */
const MIN_SIDE = 200;

/**
 * 주소만 보고 걸러낼 것들.
 * 1x1 추적 픽셀, 스프라이트, 아바타 자리표시자, 로고 아이콘이 대표 이미지로
 * 올라오면 카드 한복판에 회색 네모가 뜬다.
 */
const JUNK =
  /(^|[/_-])(1x1|pixel|spacer|blank|transparent|placeholder|sprite|icon|favicon|logo|avatar_default)([._-]|$)/i;

/** 이미지가 아닌 확장자. media:content 는 영상도 담는다 */
const NOT_IMAGE = /\.(mp4|webm|mov|m3u8|mp3|pdf|svg)(\?|$)/i;

export function cleanImage(raw: unknown, base?: string): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  let url: URL;
  try {
    // 프로토콜 없는 //example.com/a.jpg 와 상대경로를 모두 편다.
    url = new URL(trimmed, base ?? "https://example.invalid");
  } catch {
    return undefined;
  }

  // http 로 실어 보내는 피드가 있다. 화면이 https 라 섞이면 브라우저가 막는다.
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") return undefined;
  if (url.hostname === "example.invalid") return undefined;
  if (NOT_IMAGE.test(url.pathname)) return undefined;
  if (JUNK.test(url.pathname)) return undefined;

  /* 주소에 크기가 적혀 있으면 그걸로 거른다 (…/640x360/… 이나 ?w=100).
     안 적혀 있으면 통과시킨다 — 확인하려고 받아보는 건 요청이 늘어난다. */
  const sized = /(\d{2,4})[x×](\d{2,4})/.exec(url.pathname);
  if (sized) {
    const [w, h] = [Number(sized[1]), Number(sized[2])];
    if (w < MIN_SIDE && h < MIN_SIDE) return undefined;
  }
  const w = Number(url.searchParams.get("w") ?? url.searchParams.get("width"));
  if (Number.isFinite(w) && w > 0 && w < MIN_SIDE) return undefined;

  return url.toString();
}

/* ── 1. 피드가 실어 보낸 것 ──────────────────────────────── */

/**
 * RSS·Atom 항목에서 이미지를 꺼낸다.
 *
 * 네 군데를 본다. 피드마다 쓰는 자리가 다르다 — 실측한 것:
 *   enclosure       인벤 25/25 · SBS 29/29 · Polygon 10/10
 *   media:content   연합뉴스 171/120 · GamesIndustry 100/100 · Eurogamer 100/100
 *   media:thumbnail SBS 29/29 · Game Developer 50/50
 *   본문 안의 <img> 게임메카 128/30 · 루리웹 15/15 · 한겨레 30/30
 *
 * ⚠ 순서가 중요하다. media:content 는 **원본 크기**를 주고 thumbnail 은 작은
 *   것을 준다. 둘 다 있는 피드(SBS)에서 thumbnail 을 먼저 집으면 카드가 흐리다.
 */
export function imageFromEntry(
  entry: Record<string, unknown>,
  base?: string,
): string | undefined {
  for (const value of many(entry.enclosure)) {
    const type = String(value["@type"] ?? "");
    // enclosure 는 이미지 말고 오디오·영상도 담는다. type 이 있으면 믿는다.
    if (type && !type.startsWith("image/")) continue;
    const found = cleanImage(value["@url"], base);
    if (found) return found;
  }

  for (const key of ["content", "thumbnail"] as const) {
    for (const value of many(entry[key])) {
      const type = String(value["@type"] ?? value["@medium"] ?? "");
      if (type && !/^image/.test(type)) continue;
      const found = cleanImage(value["@url"], base);
      if (found) return found;
    }
  }

  /* 본문 HTML 안의 첫 <img>. 여러 장이면 첫 장이 대표인 경우가 대부분이고,
     아니어도 로고보다는 낫다. */
  for (const key of ["description", "summary", "encoded"] as const) {
    const html = entry[key];
    const text = typeof html === "string" ? html : textOf(html);
    if (!text) continue;
    for (const match of text.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      const found = cleanImage(match[1], base);
      if (found) return found;
    }
  }

  return undefined;
}

/* ── 2. 원문의 og:image ──────────────────────────────────── */

/**
 * 이미 받아 둔 HTML 에서 대표 이미지를 꺼낸다.
 *
 * ⚠ **이 함수는 요청을 하나도 늘리지 않는다.** 1층 기사는 요약하려고 어차피
 *   원문을 받는다(article.ts). 그 문자열을 여기 한 번 더 통과시킬 뿐이다.
 *
 * og:image → twitter:image → 링크된 큰 이미지 순으로 본다.
 */
export function imageFromHtml(html: string, base: string): string | undefined {
  const meta = [
    /<meta[^>]+property\s*=\s*["']og:image(?::url)?["'][^>]*>/i,
    /<meta[^>]+name\s*=\s*["']og:image(?::url)?["'][^>]*>/i,
    /<meta[^>]+name\s*=\s*["']twitter:image(?::src)?["'][^>]*>/i,
    /<meta[^>]+property\s*=\s*["']twitter:image(?::src)?["'][^>]*>/i,
  ];
  for (const pattern of meta) {
    const tag = pattern.exec(html)?.[0];
    if (!tag) continue;
    // content 가 property 앞에 오기도 한다. 태그 안에서 다시 찾는다.
    const value = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const found = cleanImage(value, base);
    if (found) return found;
  }
  return undefined;
}

/* ── 3. GitHub 아바타 ────────────────────────────────────── */

/**
 * 개발 기사에는 사진이 없다. 대신 **무엇에 관한 글인지**는 대개 분명하다.
 *
 * GitHub 은 모든 계정의 아바타를 인증 없이 `github.com/{이름}.png` 로 준다.
 * "Next.js 보안 릴리스" 에 만들어낸 자물쇠 그림을 붙이는 것보다, Vercel 아바타를
 * 붙이는 쪽이 알아보기 쉽고 공짜고 틀릴 일이 없다.
 *
 * ⚠ 억지로 갖다 붙이지 않는다. 아래 둘 중 하나로 **확실할 때만** 쓴다:
 *   · 주소가 github.com/{소유자}/… 다
 *   · 주소의 호스트가 아래 표에 있다 (그 회사가 직접 낸 글이라는 뜻)
 *   제목에서 낱말을 주워 맞히지 않는다 — 틀린 회사 로고를 다는 쪽이
 *   빈 자리보다 나쁘다.
 */
const HOST_TO_GITHUB: Record<string, string> = {
  "nextjs.org": "vercel",
  "vercel.com": "vercel",
  "react.dev": "facebook",
  "huggingface.co": "huggingface",
  "openai.com": "openai",
  "github.blog": "github",
  "docs.claude.com": "anthropics",
  "platform.claude.com": "anthropics",
  "anthropic.com": "anthropics",
  "claude.com": "anthropics",
  "tailwindcss.com": "tailwindlabs",
  "nodejs.org": "nodejs",
  "deno.com": "denoland",
  "bun.sh": "oven-sh",
  "typescriptlang.org": "microsoft",
  "devblogs.microsoft.com": "microsoft",
  "go.dev": "golang",
  "rust-lang.org": "rust-lang",
  "python.org": "python",
  "docker.com": "docker",
  "kubernetes.io": "kubernetes",
  "postgresql.org": "postgres",
  "sqlite.org": "sqlite",
  "cloudflare.com": "cloudflare",
  "blog.cloudflare.com": "cloudflare",
  "astro.build": "withastro",
  "vite.dev": "vitejs",
  "vitejs.dev": "vitejs",
  "svelte.dev": "sveltejs",
  "vuejs.org": "vuejs",
  "angular.dev": "angular",
};

/** 아바타 크기. 데스크탑 자리가 435px 이라 그 위로 넉넉히 잡는다 */
const AVATAR_SIZE = 460;

export function imageFromGithub(rawUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "github.com" || host === "gist.github.com") {
    const owner = url.pathname.split("/").filter(Boolean)[0];
    // /features, /blog 같은 GitHub 자체 경로는 계정이 아니다.
    if (owner && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) && !RESERVED.has(owner.toLowerCase())) {
      return `https://github.com/${owner}.png?size=${AVATAR_SIZE}`;
    }
    return undefined;
  }

  const owner = HOST_TO_GITHUB[host];
  return owner ? `https://github.com/${owner}.png?size=${AVATAR_SIZE}` : undefined;
}

/** GitHub 자체 경로. 계정 이름이 아니다 */
const RESERVED = new Set([
  "features", "blog", "about", "pricing", "enterprise", "security", "topics",
  "trending", "collections", "events", "sponsors", "readme", "explore",
  "marketplace", "apps", "orgs", "settings", "notifications", "search", "login",
]);

/* ── 잡동사니 ────────────────────────────────────────────── */

function many(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function textOf(value: unknown): string {
  const text = (value as { "#text"?: unknown } | null)?.["#text"];
  return typeof text === "string" ? text : "";
}
