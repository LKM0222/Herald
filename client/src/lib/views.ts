import {
  Archive,
  Bookmark,
  CalendarDays,
  CircleHelp,
  House,
  Newspaper,
  NotebookPen,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * 탭 정의는 한 곳에만 둔다 — PC 사이드바와 모바일 하단바가 같은 배열을 읽는다.
 * 두 벌로 두면 한쪽만 고쳐서 어긋난다.
 *
 * 두 벌인 것은 **순서뿐이다** (DESKTOP_TABS · MOBILE_TABS). 두 배열은 아이디만
 * 늘어놓고, 이름·아이콘·준비 여부는 아래 VIEWS 한 곳에서만 온다.
 */
export type ViewId =
  | "home"
  | "news"
  | "archive"
  | "stash"
  | "notes"
  | "quiz"
  | "schedule"
  | "settings";

export type ViewDef = {
  id: ViewId;
  Icon: LucideIcon;
  label: string;
  /** 아직 안 만든 화면. 되는 척하지 않고 "준비 중"으로 표시한다 */
  ready: boolean;
};

/**
 * 화면 등록부. **탭 줄 자체가 아니다** — 누가 줄에 서고 어떤 순서인지는
 * 아래 두 배열이 정한다.
 *
 * 설정도 여기 있다. 탭 줄에서는 빠졌지만(머리줄의 톱니로 갔다) `?v=settings` 는
 * 그대로 살아 있어야 해서 findView 가 찾을 수 있는 자리에 남는다.
 */
export const VIEWS: ViewDef[] = [
  { id: "home", Icon: House, label: "홈", ready: true },
  { id: "news", Icon: Newspaper, label: "뉴스", ready: true },
  { id: "schedule", Icon: CalendarDays, label: "일정", ready: true },
  { id: "quiz", Icon: CircleHelp, label: "문제", ready: true },
  { id: "archive", Icon: Archive, label: "지난 기록", ready: false },
  { id: "stash", Icon: Bookmark, label: "담아둔 것", ready: false },
  { id: "notes", Icon: NotebookPen, label: "메모", ready: false },
  { id: "settings", Icon: SettingsIcon, label: "설정", ready: true },
];

/** PC 좌측 레일 순서. 홈이 맨 위다 — 넓은 화면에선 위에서 아래로 읽는다. */
export const DESKTOP_TABS: ViewId[] = [
  "home",
  "news",
  "schedule",
  "quiz",
  "stash",
];

/**
 * 모바일 하단바 순서. 홈이 정중앙(3/5)에 오도록 재배치한다 —
 * 엄지가 가장 편하게 닿는 자리다. PC 사이드바는 DESKTOP_TABS 순서를 쓴다.
 */
export const MOBILE_TABS: ViewId[] = [
  "news",
  "schedule",
  "home",
  "quiz",
  "stash",
];

/**
 * ⚠ **지난 기록은 탭 줄에서 뺐다.** 다섯 칸은 늘리지 않기로 했다 — 390px 에서
 *   여섯 칸이 되면 한 칸이 65px 로 좁아지고, 홈이 정중앙(3/5)이라는 배치가
 *   깨진다. 지난 날짜는 뉴스의 날짜 화살표로 이미 갈 수 있어서 이 줄에서
 *   제일 덜 아쉬운 칸이었다. 설정처럼 등록부에는 남아 `?v=archive` 는 산다.
 *
 * ⚠ **메모도 같은 이유로 탭 줄에서 뺐다.** 문제 화면이 실제로 동작하게 되면서
 *   다섯 칸 중 하나를 내줘야 했는데, 그때 줄에 서 있던 것 중 유일하게 아직
 *   `ready: false` 인 두 칸(담아둔 것 · 메모) 가운데 메모를 뺐다.
 *   등록부에는 남아 `?v=notes` 는 그대로 "준비 중"으로 뜬다.
 */

/**
 * 탭 줄에서 빠져 머리줄로 올라간 화면. 모바일·PC 양쪽에서 같은 자리에 선다 —
 * 하루에 한 번 열까 말까 한 것이 엄지가 가장 편한 다섯 칸 중 하나를 먹고 있었다.
 */
export const HEADER_VIEW: ViewId = "settings";

export const DEFAULT_VIEW: ViewId = "home";

export function findView(id: string): ViewDef | undefined {
  return VIEWS.find((view) => view.id === id);
}

/** 순서 배열(아이디)을 정의로 편다. 두 탭 줄이 같은 등록부를 읽게 하는 다리다. */
export function tabsIn(order: ViewId[]): ViewDef[] {
  return order.map((id) => findView(id)!);
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
