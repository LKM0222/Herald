import { createContext, useContext, useEffect, useId, useState } from "react";
import type { ViewId } from "./views";

/**
 * 탭이 **실제로** 무엇을 기다리는지 한 곳에 모은다 (도면 8B · 9B).
 *
 * ⚠ 진행률을 지어내지 않는다. 여기 적힌 단계는 전부 코드에 실재하는 요청 하나씩이고,
 *   "지금 어느 단계인가" 는 그 요청을 거는 쪽(useCalendarFeed · App · Settings)이
 *   제 상태를 그대로 신고한 값이다. 타이머로 채우는 칸은 하나도 없다.
 *
 * 그래서 단계 수가 탭마다 다르다. 도면 8B·9B 는 칸이 셋이지만 뉴스 탭이 기다리는 건
 * 브리핑 한 번뿐이라 뉴스에는 한 칸만 선다 — 도면에 칸이 셋이라고 셋을 만들면
 * 화면이 거짓말을 하기 시작하고, 나중에 진짜 느린 곳을 못 찾는다.
 *
 * 그리는 쪽은 components/Loading.tsx 에 있다. 여기엔 값과 훅만 둔다.
 */

export type StageId = "briefing" | "calendar" | "settings";

export type StageState = "done" | "active" | "pending";

export type Stage = { id: StageId; label: string; state: StageState };

export type PlanStep = { id: StageId; label: string };

/**
 * 탭마다 실제로 기다리는 것. **순서대로** 적는다 — 앞 단계가 끝나야 뒤가 시작한다.
 *
 * · home     App 이 /api/briefing/{날짜} 를 받아야 Home 이 붙고(App.tsx),
 *            그제서야 Home 의 useCalendarFeed 가 /api/calendar/events 를 부른다.
 *            두 요청이 겹치지 않고 줄을 선다 — 두 칸이 진짜인 이유다.
 * · news     브리핑 하나뿐이다. News.tsx 는 네트워크를 건드리지 않는다
 *            (기사 이미지도 브리핑에 실려 온다 — d7d5100).
 * · schedule home 과 같은 두 단계. ScheduleView 는 캘린더를 두 기간(보는 달 ·
 *            이번 주)으로 **동시에** 부르지만 둘이 나란히 가니 한 단계다.
 * · settings App 이 브리핑을 아예 안 받는다(App.tsx). 세 구획이 각자 동시에
 *            /api/settings · /api/secrets · /api/calendar/subscriptions 를 부르고,
 *            화면은 그동안에도 그려져 있다. 그래서 한 단계다.
 * · archive  아직 화면이 없다.
 * · stash    아직 화면이 없다.
 */
export const STAGE_PLAN: Record<ViewId, PlanStep[]> = {
  home: [
    { id: "briefing", label: "오늘 브리핑 가져오기" },
    { id: "calendar", label: "달력에 이번 달 일정 얹기" },
  ],
  news: [{ id: "briefing", label: "오늘 기사 가져오기" }],
  schedule: [
    { id: "briefing", label: "오늘 브리핑 가져오기" },
    { id: "calendar", label: "캘린더에서 일정 가져오기" },
  ],
  settings: [{ id: "settings", label: "설정과 자격증명 상태 가져오기" }],
  archive: [],
  stash: [],
};

/** 가운데 칸에 쓰는 문구. 단계마다 기다리는 것이 달라서 한 문장으로 못 쓴다. */
export const STAGE_COPY: Record<
  StageId,
  { kicker: string; title: string; note: string }
> = {
  briefing: {
    kicker: "오늘 브리핑",
    title: "브리핑을 가져오고 있어요",
    note: "서버에 정리돼 있는 오늘 치를 읽는 중이에요.",
  },
  calendar: {
    kicker: "일정",
    title: "캘린더에서 일정을 가져오고 있어요",
    note: "켜 둔 캘린더를 서버가 한 번에 읽어서 돌려줘요. 처음 연결한 계정은 조금 더 걸려요.",
  },
  settings: {
    kicker: "설정",
    title: "설정을 불러오고 있어요",
    note: "저장해 둔 소스 목록과 자격증명 상태를 확인하는 중이에요.",
  },
};

/**
 * 이 시간을 넘겨 기다릴 때만 표시를 켠다.
 *
 * 로컬이나 캐시가 맞은 요청은 100ms 안에 끝난다. 그때도 진행선을 켜면 나타났다
 * 사라지는 번쩍임만 남아서 오히려 화면이 튀는 것처럼 보인다. 사람이 "끊겼다" 고
 * 느끼기 시작하는 경계가 대략 0.2~0.3초라, 그 아래는 아무것도 안 보여주는 쪽이 낫다.
 */
export const LOADING_DELAY_MS = 250;

export type Report = { stage: StageId; busy: boolean };

export type Loading = { stages: Stage[]; busy: boolean; show: boolean };

export const NOT_LOADING: Loading = { stages: [], busy: false, show: false };

/*
  신고용과 조회용을 나눠 둔다. 신고 함수는 절대 안 바뀌어서, 깊은 곳에 있는
  useReportStage 들이 단계가 바뀔 때마다 딸려 도는 일을 막는다.
*/
export const ReportContext = createContext<
  ((key: string, report: Report | null) => void) | null
>(null);

export const LoadingContext = createContext<Loading>(NOT_LOADING);

/** 지금 이 탭이 무엇을 기다리는지. 표시하는 쪽(셸 · 가운데 칸)이 읽는다. */
export function useLoading(): Loading {
  return useContext(LoadingContext);
}

/**
 * 기다리는 쪽이 제 상태를 신고한다.
 *
 * 같은 단계를 여럿이 신고할 수 있다 (일정 탭은 캘린더를 두 기간 부른다).
 * 하나라도 돌고 있으면 그 단계는 도는 중이다.
 */
export function useReportStage(stage: StageId, busy: boolean): void {
  const report = useContext(ReportContext);
  const key = useId();

  useEffect(() => {
    if (!report) return;
    report(key, { stage, busy });
    // 화면이 사라지면 신고도 걷는다 — 안 걷으면 끝난 요청이 계속 도는 걸로 남는다.
    return () => report(key, null);
  }, [report, key, stage, busy]);
}

/**
 * 계획과 신고를 맞춰 "몇 단계까지 왔나" 를 낸다.
 *
 * 계획이 순서대로라, 지금 도는 단계 앞은 끝난 것이고 뒤는 아직 시작도 안 한 것이다.
 * 이 한 규칙으로만 정한다 — 따로 세면 실제와 어긋난다.
 */
export function resolveStages(
  view: ViewId,
  reports: Record<string, Report>,
): { stages: Stage[]; busy: boolean } {
  const plan = STAGE_PLAN[view];
  const running = new Set(
    Object.values(reports)
      .filter((item) => item.busy)
      .map((item) => item.stage),
  );
  const at = plan.findIndex((step) => running.has(step.id));
  const stages: Stage[] = plan.map((step, index) => ({
    ...step,
    state: index < at ? "done" : index === at ? "active" : "pending",
  }));
  return { stages, busy: at >= 0 };
}

/**
 * active 가 delayMs 넘게 이어질 때만 true. 꺼질 땐 곧바로 false.
 *
 * 끄는 걸 늦추지 않는 이유: 데이터가 도착했는데 진행선이 남아 있으면
 * 그때부터는 화면이 거짓말을 한다.
 */
export function useDelayedFlag(
  active: boolean,
  delayMs: number = LOADING_DELAY_MS,
): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return shown;
}
