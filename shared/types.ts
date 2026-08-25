/** 1 = 먼저 볼 것, 2 = 훑어볼 것, 3 = 참고 */
export type Priority = 1 | 2 | 3;

export type NewsItem = {
  id: string;
  /**
   * 원문 제목. 화면의 주인공이 아니다 —
   * RSS 제목은 영어가 많고 낚시성이라 판단 근거로 쓰기 나쁘다.
   */
  title: string;
  url: string;
  /** 매체 이름 */
  source: string;
  /** 원문 발행 시각 (ISO) */
  publishedAt: string;

  // ── 아래는 요약 단계가 채운다. 수집만 된 항목은 비어 있다 ──

  /** 한국어 한 줄 요약. 화면에서 제목 자리를 차지한다 */
  summary?: string;
  /**
   * 왜 나한테 중요한가.
   * 단순 요약은 RSS 설명으로도 되지만 이 판단은 LLM 만 한다 —
   * 이게 요약 단계를 두는 이유다. 연결점이 없으면 붙이지 않는다.
   */
  relevance?: string;
  /** "AI 코딩" 처럼 주제 묶음 */
  topic?: string;
  /** 없으면 3으로 취급한다 */
  priority?: Priority;
  /** 같은 사건을 보도한 다른 기사들. 중복을 지우지 않고 묶어서 보여준다 */
  alsoIn?: { source: string; url: string }[];
};

export type ScheduleItem = {
  id: string;
  /** "10:00" */
  time: string;
  title: string;
};

export type ContinueItem = {
  project: string;
  /** 어제 어디까지 갔나 */
  yesterday: string;
  /** 다음에 이어갈 것 */
  next: string;
};

export type LaunchItem = {
  id: string;
  icon: string;
  label: string;
  kind: "routine" | "app";
};

export type Briefing = {
  /** YYYY-MM-DD */
  date: string;
  /** 요약이 끝난 시각. 아직 안 돌았으면 null */
  generatedAt: string | null;
  /**
   * 실제 수집이 아니라 더미라는 표시.
   * 화면이 이걸 드러내지 않으면 "오늘 뉴스가 이것뿐인가"로 잘못 읽힌다.
   */
  sample?: boolean;
  headline: string;
  news: NewsItem[];
  schedule: ScheduleItem[];
  continues: ContinueItem[];
  launchpad: LaunchItem[];
};

/**
 * 화면에서 넣는 자격증명의 상태.
 * ⚠ 값 자체는 절대 이 타입에 담기지 않는다 — 서버가 돌려주지 않는다.
 */
export type SecretStatus = {
  name: "anthropic";
  label: string;
  set: boolean;
  /** 끝 네 자리. 맞는 키를 넣었는지 눈으로 대조하는 용도 */
  tail?: string;
  updatedAt?: string;
  /** 저장분이 없고 .env 로 들어온 경우. 화면에서 바꿀 수 없다 */
  fromEnv?: boolean;
};
