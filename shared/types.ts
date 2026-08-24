export type NewsItem = {
  id: string;
  title: string;
  url: string;
  /** "AI" · "개발" 처럼 요약 단계에서 붙는 분류 */
  category: string;
  /** 내 프로젝트에 영향이 있다고 판단된 항목 */
  flagged?: boolean;
  flagReason?: string;
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
  headline: string;
  news: NewsItem[];
  schedule: ScheduleItem[];
  continues: ContinueItem[];
  launchpad: LaunchItem[];
};
