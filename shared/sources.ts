/**
 * 수집 대상 후보 목록.
 *
 * 화면과 서버가 같은 목록을 봐야 해서 shared 에 둔다.
 * 주소는 전부 실제로 열어 확인했다 — 죽은 주소를 박아두면 수집이 조용히 비어버린다.
 */
export type SourceId = (typeof CATALOG)[number]["id"];

export type SourceInfo = {
  id: string;
  name: string;
  /** RSS · Atom 피드 주소 */
  url: string;
  /** 사람이 보는 사이트 */
  site: string;
  /** 무엇을 다루는 곳인지 — 설정 화면에서 고르는 근거가 된다 */
  note: string;
  /** 하루 발행량이 많아 "참고" 층으로 밀릴 가능성이 큰 곳 */
  noisy?: boolean;
};

export const CATALOG = [
  {
    id: "geeknews",
    name: "GeekNews",
    url: "https://news.hada.io/rss/news",
    site: "https://news.hada.io",
    note: "한국 개발자 커뮤니티. 한국어라 요약 없이도 읽힌다",
  },
  {
    id: "hackernews",
    name: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    site: "https://news.ycombinator.com",
    note: "원류. 개발·AI 소식이 가장 먼저 뜨는 곳",
  },
  {
    id: "simonwillison",
    name: "Simon Willison",
    url: "https://simonwillison.net/atom/everything/",
    site: "https://simonwillison.net",
    note: "AI 도구를 실제로 써보고 쓰는 블로그. 신호 대 잡음비가 가장 좋다",
  },
  {
    id: "githubblog",
    name: "GitHub Blog",
    url: "https://github.blog/feed/",
    site: "https://github.blog",
    note: "개발 도구 · Copilot 1차 발표",
  },
  {
    id: "openai",
    name: "OpenAI",
    url: "https://openai.com/news/rss.xml",
    site: "https://openai.com/news",
    note: "1차 발표",
  },
  {
    id: "googleai",
    name: "Google AI",
    url: "https://blog.google/technology/ai/rss/",
    site: "https://blog.google/technology/ai",
    note: "1차 발표",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml",
    site: "https://huggingface.co/blog",
    note: "모델 · 오픈소스 생태계",
  },
  {
    id: "nextjs",
    name: "Next.js",
    url: "https://nextjs.org/feed.xml",
    site: "https://nextjs.org/blog",
    note: "Herald 서버가 쓰는 프레임워크",
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    site: "https://techcrunch.com/category/artificial-intelligence/",
    note: "업계 동향. 양은 많고 밀도는 낮다",
    noisy: true,
  },
  {
    id: "verge-ai",
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    site: "https://www.theverge.com/ai-artificial-intelligence",
    note: "업계 동향. 양은 많고 밀도는 낮다",
    noisy: true,
  },
] as const satisfies readonly SourceInfo[];

/**
 * 아무것도 고르지 않았을 때의 기본값.
 * 성격이 안 겹치는 셋 — 한국어 하나, 원류 하나, 밀도 높은 개인 블로그 하나.
 */
export const DEFAULT_ENABLED: string[] = [
  "geeknews",
  "hackernews",
  "simonwillison",
];

export function findSource(id: string): SourceInfo | undefined {
  return CATALOG.find((source) => source.id === id);
}

/**
 * ⚠ Anthropic 은 공식 RSS 가 없다 (news/rss.xml · feed.xml · news/feed 모두 404).
 *    필요하면 다른 경로를 찾아야 한다.
 */
