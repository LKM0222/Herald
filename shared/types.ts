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
  /**
   * 피드가 제 손으로 실어 보낸 소개글. 요약이 아니라 **요약에 넣을 재료**다.
   * 수집 단계에서 채워지고 길이를 잘라 담는다 — 글 전문을 보내는 피드가 있다.
   */
  excerpt?: string;
  /** 같은 사건을 보도한 다른 기사들. 중복을 지우지 않고 묶어서 보여준다 */
  alsoIn?: { source: string; url: string }[];
};

export type ScheduleItem = {
  id: string;
  /** "10:00". 종일 일정이면 빈 문자열 */
  time: string;
  /** "11:00". 없으면 시작 시각만 보여준다 */
  endTime?: string;
  title: string;
  allDay?: boolean;
};

/** 오늘 이후의 일정. 일정 탭의 "다음 7일" 이 쓴다. */
export type UpcomingItem = ScheduleItem & {
  /** YYYY-MM-DD */
  date: string;
};

/** 일정 탭의 주간 띠 한 칸. */
export type WeekDay = {
  /** YYYY-MM-DD */
  date: string;
  /** 그날 일정 수. 점 개수로 그린다 */
  count: number;
};

/**
 * 캘린더에서 읽어온 일정 한 건.
 *
 * 브리핑이 들고 있는 schedule/upcoming 과 달리 기간 제한이 없다 —
 * 일정 탭이 달을 넘길 때마다 그 범위를 따로 받아온다.
 */
export type CalendarEvent = UpcomingItem & {
  /** 장소. 비어 있으면 필드가 없다 */
  place?: string;
  /** 어느 캘린더에서 왔나. 여러 개를 붙이면 섞이기 때문에 남긴다 */
  calendar?: string;

  /*
    ── 여러 날에 걸친 일정에만 붙는다 ────────────────────────────
    서버는 걸친 날마다 한 건씩 펴서 준다. 그래야 "그날 뭐 있나" 를 묻는
    쪽이 단순해진다. 대신 달력이 띠 하나로 이어 그리려면 흩어진 날들이
    한 일정이라는 걸 알아야 해서, 그 최소한만 함께 싣는다.
    하루짜리에는 셋 다 없다.
  */

  /** 같은 일정에서 나온 날들을 묶는 값 */
  spanId?: string;
  /** 일정이 실제로 시작하는 날 (YYYY-MM-DD) */
  spanStart?: string;
  /** 일정이 실제로 끝나는 날 (YYYY-MM-DD) */
  spanEnd?: string;
};

/**
 * 등록해 둔 캘린더 주소 하나.
 * ⚠ publishedKey 는 담기지 않는다 — 그 키를 아는 사람은 일정을 다 읽는다.
 */
export type CalendarSubscription = {
  id: string;
  /** 네이버가 붙인 캘린더 이름 */
  label: string;
  /** 소유 계정 아이디. 어느 계정 것인지 구분용 */
  owner: string;
  addedAt: string;
  /**
   * 조회에 쓸지 여부. 끄는 것은 **빼는 것과 다르다** —
   * 주소를 지우지 않으니 다시 켜면 그대로 돌아온다.
   */
  enabled: boolean;
  /**
   * 캘린더가 들고 온 색(# 없는 6자리). 우리가 고른 값이 아니라 네이버에서
   * 온 데이터다. 이 필드가 생기기 전에 붙여둔 캘린더엔 없어서 선택형이고,
   * 없으면 화면이 기본 색으로 그린다.
   */
  color?: string;
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
  /** 다음 7일. 캘린더가 안 붙었으면 빈 배열 */
  upcoming: UpcomingItem[];
  /** 이번 주 일곱 칸. 캘린더가 안 붙었으면 빈 배열 */
  week: WeekDay[];
  continues: ContinueItem[];
  launchpad: LaunchItem[];
};

/**
 * 화면에서 넣는 자격증명의 상태.
 * ⚠ 값 자체는 절대 이 타입에 담기지 않는다 — 서버가 돌려주지 않는다.
 */
export type SecretName = "anthropic" | "naver_id" | "naver_password";

export type SecretStatus = {
  name: SecretName;
  label: string;
  set: boolean;
  /** 끝 네 자리. 맞는 키를 넣었는지 눈으로 대조하는 용도 */
  tail?: string;
  updatedAt?: string;
  /** 저장분이 없고 .env 로 들어온 경우. 화면에서 바꿀 수 없다 */
  fromEnv?: boolean;
};
