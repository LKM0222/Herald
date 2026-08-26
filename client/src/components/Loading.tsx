import { Check } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  LoadingContext,
  ReportContext,
  resolveStages,
  STAGE_COPY,
  useDelayedFlag,
  useReportStage,
  type Loading,
  type Report,
  type Stage,
  type StageId,
} from "../lib/loading";
import type { ViewId } from "../lib/views";
import { Kicker } from "./ui";

/**
 * 기다리는 표시 (도면 8B · 9B). 무엇을 기다리는지는 lib/loading.ts 가 정한다.
 *
 * 색은 전부 --accent 가 아니라 **--accent-700(text-accent-ink)** 을 쓴다.
 * 여섯 팔레트의 라이트 강조색은 대비가 제각각이라 (실측 배경 대비: navy 2.35 ·
 * terracotta 3.23 · forest 3.37 … mono 10.43) 얇은 선과 작은 글씨를 --accent 로
 * 그리면 navy·forest·terracotta 라이트에서 거의 안 보인다. accent-700 은
 * 열두 조합 전부에서 4.4 이상이라 어디서든 읽힌다.
 */

/**
 * 기다리는 표시는 셸(진행선 · 탭)과 가운데 칸 두 군데에 나뉘어 뜨는데,
 * "지금 무엇을 기다리는가" 는 한 곳에서만 정해져야 한다 — 두 벌로 두면
 * 진행선은 도는데 가운데는 다 왔다고 말하는 상태가 생긴다.
 */
export function LoadingProvider({
  view,
  children,
}: {
  view: ViewId;
  children: ReactNode;
}) {
  const [reports, setReports] = useState<Record<string, Report>>({});

  const report = useCallback((key: string, next: Report | null) => {
    setReports((prev) => {
      const current = prev[key];
      if (next === null) {
        if (!current) return prev;
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      // 값이 그대로면 같은 객체를 돌려준다 — 안 그러면 신고 → 리렌더 → 신고로 돈다.
      if (current && current.stage === next.stage && current.busy === next.busy) {
        return prev;
      }
      return { ...prev, [key]: next };
    });
  }, []);

  const progress = useMemo(() => resolveStages(view, reports), [view, reports]);
  const show = useDelayedFlag(progress.busy);
  const value = useMemo<Loading>(
    () => ({ ...progress, show }),
    [progress, show],
  );

  return (
    <ReportContext.Provider value={report}>
      <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
    </ReportContext.Provider>
  );
}

/** 훅을 못 쓰는 자리(provider 를 그리는 App)에서 신고할 때. */
export function StageReport({
  stage,
  busy,
}: {
  stage: StageId;
  busy: boolean;
}): null {
  useReportStage(stage, busy);
  return null;
}

/**
 * 2px 진행선. 끝을 모르니 채우지 않고 흐르게 둔다.
 *
 * ⚠ absolute 다. 자리를 차지하면 나타날 때 아래 내용이 통째로 내려가는데,
 *   그 덜컥임이 진행선이 주는 정보보다 훨씬 거슬린다.
 */
export function LoadingBar() {
  return (
    <div
      role="progressbar"
      aria-label="불러오는 중"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-accent-soft"
    >
      {/* valuenow 를 안 준다 — 얼마나 남았는지 모르는 게 사실이다 */}
      <span className="loading-bar-run absolute inset-y-0 block w-1/3 rounded-full bg-accent-ink" />
    </div>
  );
}

/**
 * 탭 아이콘 자리에 서는 도는 원 (도면 9B 의 하단 탭, 8B 의 좌측 레일).
 *
 * ⚠ 아이콘과 **같은 크기**로 그린다. 크기가 달라지면 탭 줄이 통째로 밀린다.
 */
export function TabSpinner({ size }: { size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="loading-ring block shrink-0"
    />
  );
}

/**
 * 가운데 칸 — 지금 어느 단계인지 (도면 8B · 9B).
 *
 * 도면에는 아래에 "2곳 중 1곳 · 46%" 같은 채워지는 막대가 있지만 여기엔 없다.
 * 서버가 캘린더를 **한 요청에 몰아서** 돌려줘서 화면은 "몇 곳까지 읽었는지" 를
 * 알 방법이 없다. 모르는 숫자를 채워 넣느니 안 보여주는 쪽이 맞다.
 */
export function LoadingPanel({ stages }: { stages: Stage[] }) {
  const active = stages.find((stage) => stage.state === "active");
  if (!active) return null;

  const copy = STAGE_COPY[active.id];
  const step = stages.indexOf(active) + 1;

  return (
    <div className="flex max-w-lg flex-col items-start gap-4 self-start">
      <div className="flex flex-col gap-1.5">
        <Kicker>{copy.kicker}</Kicker>
        <h2 className="font-display text-2xl leading-tight">{copy.title}</h2>
        <p className="text-sm leading-relaxed text-dim">{copy.note}</p>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} />
        ))}
      </ul>

      {/* 한 단계뿐인 탭에서는 셈이 아무 말도 안 한다. 그럴 땐 안 쓴다 */}
      {stages.length > 1 ? (
        <p className="text-xs text-dim">
          {stages.length}단계 중 {step}단계
        </p>
      ) : null}
    </div>
  );
}

/** 단계 한 줄. 좁은 화면에서 답답하지 않게 48px 로 둔다 (도면 9C 와 같은 값). */
function StageRow({ stage }: { stage: Stage }) {
  const tone =
    stage.state === "active"
      ? "border-accent-ink bg-accent-soft text-accent-ink"
      : stage.state === "done"
        ? "border-line text-dim"
        : "border-line text-dim opacity-55";

  return (
    <li
      className={`flex min-h-12 items-center gap-3 rounded-xl border px-3.5 text-sm ${tone}`}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {stage.state === "active" ? (
          <TabSpinner size={16} />
        ) : stage.state === "done" ? (
          <Check size={16} strokeWidth={2} aria-hidden="true" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">{stage.label}</span>
    </li>
  );
}
