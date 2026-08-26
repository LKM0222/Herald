import { AREA_IDS, type Area } from "./types";

/**
 * 수집 대상 후보 목록.
 *
 * 화면과 서버가 같은 목록을 봐야 해서 shared 에 둔다.
 * 주소는 전부 실제로 열어 확인했다 — 죽은 주소를 박아두면 수집이 조용히 비어버린다.
 *
 * ⚠ **200 을 준다고 쓸 수 있는 게 아니다.** 후보 40곳을 받아보고 떨어뜨린 것들:
 *   한국경제(본문 전부 0자) · 한겨레(30건 전부 날짜 없음 — 기간으로 자르는 우리
 *   수집기가 통째로 버린다) · 디스이즈게임(404) · Yahoo Finance(본문 15자) ·
 *   머니투데이 종합(본문 356자로 두껍지만 증권 낱말이 100건 중 7건뿐이라 경제
 *   영역에 못 쓴다). MarketWatch 실시간 피드는 200 을 주지만 최근 글이 2012년이다.
 *
 * ⚠ **curl 로 확인하지 마라. Node 로 확인해라.** 이데일리 증권
 *   (rss.edaily.co.kr/stock_news.xml) 은 curl 로는 200 인데 서버에서는
 *   `unsupported protocol` 로 죽는다 — 그쪽이 옛 TLS 만 받고 Node 가 거절한다.
 *   curl 은 Windows 인증 스택을 쓰기 때문에 통과한 것이다. 실제로 이걸 모르고
 *   넣었다가 수집이 통째로 비었다. 지금은 아시아경제 증권으로 갈아 놨다.
 *
 * 아래 note 의 숫자는 그래서 적어 둔 실측값이다.
 */
export type SourceId = (typeof CATALOG)[number]["id"];

export type SourceInfo = {
  id: string;
  name: string;
  /** 어느 탭에 실릴지. 이 값이 곧 채점 기준을 고른다 */
  area: Area;
  /** RSS · Atom 피드 주소 */
  url: string;
  /** 사람이 보는 사이트 */
  site: string;
  /** 무엇을 다루는 곳인지 — 설정 화면에서 고르는 근거가 된다 */
  note: string;
  /** 하루 발행량이 많아 "참고" 층으로 밀릴 가능성이 큰 곳 */
  noisy?: boolean;
};

/** 탭 이름과 순서. 이 순서가 곧 중복 우선순위다 (types.ts 의 Area 참고) */
export const AREAS: { id: Area; label: string; note: string }[] = [
  { id: "dev", label: "개발", note: "쓰는 도구가 실제로 바뀌는 소식" },
  { id: "game", label: "게임", note: "업계 · 신작 · 업데이트" },
  { id: "finance", label: "경제", note: "국내 시장과 미국 시장" },
  { id: "general", label: "일반", note: "오늘 큰 뉴스" },
];

export const CATALOG = [
  // ── 개발 ────────────────────────────────────────────────
  {
    id: "geeknews",
    name: "GeekNews",
    area: "dev",
    url: "https://news.hada.io/rss/news",
    site: "https://news.hada.io",
    note: "한국 개발자 커뮤니티. 한국어라 요약 없이도 읽힌다",
  },
  {
    id: "hackernews",
    name: "Hacker News",
    area: "dev",
    url: "https://news.ycombinator.com/rss",
    site: "https://news.ycombinator.com",
    note: "원류. 개발·AI 소식이 가장 먼저 뜨는 곳",
  },
  {
    id: "simonwillison",
    name: "Simon Willison",
    area: "dev",
    url: "https://simonwillison.net/atom/everything/",
    site: "https://simonwillison.net",
    note: "AI 도구를 실제로 써보고 쓰는 블로그. 신호 대 잡음비가 가장 좋다",
  },
  {
    id: "githubblog",
    name: "GitHub Blog",
    area: "dev",
    url: "https://github.blog/feed/",
    site: "https://github.blog",
    note: "개발 도구 · Copilot 1차 발표",
  },
  {
    id: "openai",
    name: "OpenAI",
    area: "dev",
    url: "https://openai.com/news/rss.xml",
    site: "https://openai.com/news",
    note: "1차 발표",
  },
  {
    id: "googleai",
    name: "Google AI",
    area: "dev",
    url: "https://blog.google/technology/ai/rss/",
    site: "https://blog.google/technology/ai",
    note: "1차 발표",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    area: "dev",
    url: "https://huggingface.co/blog/feed.xml",
    site: "https://huggingface.co/blog",
    note: "모델 · 오픈소스 생태계",
  },
  {
    id: "nextjs",
    name: "Next.js",
    area: "dev",
    url: "https://nextjs.org/feed.xml",
    site: "https://nextjs.org/blog",
    note: "Herald 서버가 쓰는 프레임워크",
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    area: "dev",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    site: "https://techcrunch.com/category/artificial-intelligence/",
    note: "업계 동향. 양은 많고 밀도는 낮다",
    noisy: true,
  },
  {
    id: "verge-ai",
    name: "The Verge AI",
    area: "dev",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    site: "https://www.theverge.com/ai-artificial-intelligence",
    note: "업계 동향. 양은 많고 밀도는 낮다",
    noisy: true,
  },

  // ── 게임 ────────────────────────────────────────────────
  {
    id: "gamemeca",
    name: "게임메카",
    area: "game",
    url: "https://www.gamemeca.com/rss.php",
    site: "https://www.gamemeca.com",
    note: "국내 게임 매체. 본문을 880자까지 실어 보낸다 — 재료가 가장 좋다",
  },
  {
    id: "inven",
    name: "인벤",
    area: "game",
    url: "https://www.inven.co.kr/webzine/news/rss.php",
    site: "https://www.inven.co.kr/webzine/news/",
    note: "국내 게임 매체. 신작 · 업데이트 · 커뮤니티 소식",
  },
  {
    id: "ruliweb",
    name: "루리웹",
    area: "game",
    url: "https://bbs.ruliweb.com/news/rss",
    site: "https://bbs.ruliweb.com/news",
    note: "국내 게임 매체. 콘솔 · 해외 소식이 빠르다",
  },
  {
    id: "gamesindustry",
    name: "GamesIndustry.biz",
    area: "game",
    url: "https://www.gamesindustry.biz/feed",
    site: "https://www.gamesindustry.biz",
    note: "게임 업계 동향의 표준. 회사 · 시장 · 인사",
    noisy: true,
  },
  {
    id: "eurogamer",
    name: "Eurogamer",
    area: "game",
    url: "https://www.eurogamer.net/feed",
    site: "https://www.eurogamer.net",
    note: "해외 신작 · 리뷰. 본문 242자",
    noisy: true,
  },

  // ── 증권 · 국내 ─────────────────────────────────────────
  {
    id: "asiae-stock",
    name: "아시아경제 증권",
    area: "finance",
    url: "https://www.asiae.co.kr/rss/stock.htm",
    site: "https://www.asiae.co.kr/stock",
    note: "국내 증시 전용. 본문 238자로 국내 중 가장 두껍다",
  },
  {
    id: "yna-economy",
    name: "연합뉴스 경제",
    area: "finance",
    url: "https://www.yna.co.kr/rss/economy.xml",
    site: "https://www.yna.co.kr/economy",
    note: "국내 경제 전반. 하루 120건 이상이라 상한에 자주 걸린다",
    noisy: true,
  },
  {
    id: "mk-economy",
    name: "매일경제",
    area: "finance",
    url: "https://www.mk.co.kr/rss/30100041/",
    site: "https://www.mk.co.kr/news/economy/",
    note: "국내 경제 · 시장",
    noisy: true,
  },

  // ── 증권 · 미국 ─────────────────────────────────────────
  {
    id: "cnbc",
    name: "CNBC",
    area: "finance",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    site: "https://www.cnbc.com",
    note: "미국장. 30건 중 28건이 24시간 안에 들어온다",
  },
  {
    id: "ft-markets",
    name: "FT Markets",
    area: "finance",
    url: "https://www.ft.com/markets?format=rss",
    site: "https://www.ft.com/markets",
    note: "미국 · 글로벌 시장",
  },
  {
    id: "businessinsider-markets",
    name: "Business Insider Markets",
    area: "finance",
    url: "https://markets.businessinsider.com/rss/news",
    site: "https://markets.businessinsider.com",
    note: "미국장. 본문 334자로 이 영역에서 가장 두껍다",
  },

  // ── 일반 ────────────────────────────────────────────────
  {
    id: "yna-news",
    name: "연합뉴스",
    area: "general",
    url: "https://www.yna.co.kr/rss/news.xml",
    site: "https://www.yna.co.kr",
    note: "국내 종합. 하루 120건 이상 — 경제 피드와 23% 겹친다(증권이 가져간다)",
    noisy: true,
  },
  {
    id: "khan",
    name: "경향신문",
    area: "general",
    url: "https://www.khan.co.kr/rss/rssdata/total_news.xml",
    site: "https://www.khan.co.kr",
    note: "국내 종합. 본문 203자",
    noisy: true,
  },
  {
    id: "sbs-news",
    name: "SBS 뉴스",
    area: "general",
    url: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01",
    site: "https://news.sbs.co.kr",
    note: "국내 종합. 방송 기사라 짧다",
  },
] as const satisfies readonly SourceInfo[];

/**
 * 아무것도 고르지 않았을 때의 기본값.
 *
 * ⚠ **영역이 넷으로 늘어도 개발 셋 그대로다.** 기본값을 늘리면 켜겠다고 말한 적
 *   없는 사람의 토큰이 나간다. 나머지는 설정에서 직접 켠다.
 *   성격이 안 겹치는 셋 — 한국어 하나, 원류 하나, 밀도 높은 개인 블로그 하나.
 */
export const DEFAULT_ENABLED: string[] = [
  "geeknews",
  "hackernews",
  "simonwillison",
];

export function findSource(id: string): SourceInfo | undefined {
  return CATALOG.find((source) => source.id === id);
}

/** 영역별로 갈라 담는다. 빈 영역도 칸은 남긴다 — 화면이 탭을 그려야 한다. */
export function byArea<T extends { area: Area }>(
  list: readonly T[],
): Record<Area, T[]> {
  const out = Object.fromEntries(
    AREA_IDS.map((id) => [id, [] as T[]]),
  ) as Record<Area, T[]>;
  for (const one of list) out[one.area].push(one);
  return out;
}

/**
 * ⚠ Anthropic 은 공식 RSS 가 없다 (news/rss.xml · feed.xml · news/feed 모두 404).
 *    필요하면 다른 경로를 찾아야 한다.
 */
