/**
 * 면접 문제 300개. 뉴스·일정과 달리 **서버를 타지 않는다** —
 * 내용이 고정이라 수집할 것도, 시크릿도, 날짜도 없다.
 *
 * 그래서 `client/public/quiz.json` 정적 파일로 두고 문제 화면을 열 때만 받는다.
 * 번들에 import 하면 홈·뉴스만 보는 사람도 450KB 를 같이 내려받게 된다.
 */

export type Question = {
  id: string;
  no: number;
  part: string;
  topic: string;
  level: string;
  type: string;
  star: boolean;
  title: string;
  question: string;
  answer: string;
  interview: string;
  keywords: string[];
  followQ: string;
  followA: string;
};

/**
 * `vite.config.ts` 가 `base: "./"` 라 절대경로로 부르면 Pages 하위경로(/Herald/)
 * 에서 깨진다. BASE_URL 을 앞에 붙여 번들이 놓인 자리를 기준으로 찾는다.
 */
const QUIZ_URL = `${import.meta.env.BASE_URL}quiz.json`;

/** 한 번 받으면 들고 있는다. 탭을 오갈 때마다 450KB 를 다시 받지 않는다. */
let cached: Question[] | null = null;

export async function loadQuiz(): Promise<Question[]> {
  if (cached) return cached;

  const response = await fetch(QUIZ_URL);
  if (!response.ok) {
    throw new Error(`문제 파일을 불러오지 못했어요 (HTTP ${response.status})`);
  }

  const parsed: unknown = await response.json();
  if (!Array.isArray(parsed)) {
    throw new Error("문제 파일 형식이 올바르지 않아요");
  }

  // 번호순으로 고정한다. 화면 여러 곳이 "앞에서부터" 를 전제로 센다.
  cached = (parsed as Question[]).slice().sort((a, b) => a.no - b.no);
  return cached;
}

/** 등장 순서를 지키면서 중복만 걷어낸다 (Set 은 순서를 보장하지만 의도를 적어둔다). */
function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

export function partsOf(questions: Question[]): string[] {
  return distinct(questions.map((q) => q.part));
}

export function topicsOf(questions: Question[], part: string): string[] {
  return distinct(
    questions.filter((q) => q.part === part).map((q) => q.topic),
  );
}
