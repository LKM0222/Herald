import {
  Archive,
  CalendarDays,
  House,
  Newspaper,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * 탭 정의는 한 곳에만 둔다 — PC 사이드바와 모바일 하단바가 같은 배열을 읽는다.
 * 두 벌로 두면 한쪽만 고쳐서 어긋난다.
 */
export type ViewId = "home" | "news" | "archive" | "schedule" | "settings";

export type ViewDef = {
  id: ViewId;
  Icon: LucideIcon;
  label: string;
  /** 아직 안 만든 화면. 되는 척하지 않고 "준비 중"으로 표시한다 */
  ready: boolean;
};

export const VIEWS: ViewDef[] = [
  { id: "home", Icon: House, label: "홈", ready: true },
  { id: "news", Icon: Newspaper, label: "뉴스", ready: true },
  { id: "archive", Icon: Archive, label: "지난 기록", ready: false },
  { id: "schedule", Icon: CalendarDays, label: "일정", ready: true },
  { id: "settings", Icon: SettingsIcon, label: "설정", ready: true },
];

/**
 * 모바일 하단바 순서. 홈이 정중앙(3/5)에 오도록 재배치한다 —
 * 엄지가 가장 편하게 닿는 자리다. PC 사이드바는 VIEWS 순서 그대로 쓴다.
 */
export const MOBILE_ORDER: ViewId[] = [
  "news",
  "archive",
  "home",
  "schedule",
  "settings",
];

export const DEFAULT_VIEW: ViewId = "home";

export function findView(id: string): ViewDef | undefined {
  return VIEWS.find((view) => view.id === id);
}

/**
 * 화면 이동은 쿼리로 한다 (?v=news).
 * 정적 호스팅은 /news 같은 경로에 파일이 없으면 404 를 내기 때문 — 날짜(?d=)와 같은 이유다.
 */
export function hrefFor(view: ViewId, date?: string): string {
  const params = new URLSearchParams();
  if (view !== DEFAULT_VIEW) params.set("v", view);
  if (date) params.set("d", date);
  const query = params.toString();
  return query ? `?${query}` : "./";
}

export function viewFromLocation(search: string): ViewId {
  const requested = new URLSearchParams(search).get("v");
  return requested && findView(requested) ? (requested as ViewId) : DEFAULT_VIEW;
}
