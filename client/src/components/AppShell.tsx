import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/**
 * 같은 내비게이션을 두 자리에 놓는다 —
 * PC 는 좌측 사이드바, 모바일은 하단 탭바. 항목 정의는 하나뿐이다.
 */
const NAV = [
  { id: "today", icon: "📅", label: "오늘", ready: true },
  { id: "archive", icon: "🗂", label: "지난 기록", ready: false },
  { id: "sources", icon: "📰", label: "소스", ready: false },
  { id: "routines", icon: "🔁", label: "루틴", ready: false },
  { id: "settings", icon: "⚙", label: "설정", ready: false },
] as const;

export function AppShell({
  dateLabel,
  todayHref,
  onOpenSettings,
  children,
}: {
  dateLabel: string;
  todayHref: string;
  onOpenSettings: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
        {/* 좁은 화면에선 날짜가 줄어들며 버티게 한다 — 브레이크포인트로 끊지 않는다 */}
        <div className="flex min-w-0 items-baseline gap-2">
          <Logo className="h-7 w-auto shrink-0" />
          {/* 모바일에선 수탉이 곧 로고다. 글자까지 둘 자리가 없다 */}
          <span className="hidden font-semibold tracking-tight sm:inline">
            Herald
          </span>
          <span className="truncate text-sm text-muted">{dateLabel}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="연결 설정"
            className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-border px-2 text-xs text-muted hover:text-foreground sm:px-3"
          >
            <span aria-hidden="true" className="sm:hidden">
              ⚙
            </span>
            <span className="hidden sm:inline">연결 설정</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* 사이드바 — PC 전용 */}
        <nav className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border p-3 md:flex">
          {NAV.map((item) =>
            item.ready ? (
              <a
                key={item.id}
                href={todayHref}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-accent/10 px-3 text-sm font-medium text-accent"
              >
                <span>{item.icon}</span>
                {item.label}
              </a>
            ) : (
              <span
                key={item.id}
                title="다음 단계에서 연결됩니다"
                className="flex min-h-11 cursor-default items-center gap-2 rounded-lg px-3 text-sm text-muted opacity-50"
              >
                <span>{item.icon}</span>
                {item.label}
              </span>
            ),
          )}
        </nav>

        {/* 본문 — 하단 탭바에 가리지 않도록 모바일에서 아래 여백을 준다 */}
        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 md:pb-8">{children}</main>
      </div>

      {/* 하단 탭바 — 모바일 전용 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden">
        {NAV.map((item) =>
          item.ready ? (
            <a
              key={item.id}
              href={todayHref}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-accent"
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </a>
          ) : (
            <span
              key={item.id}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-muted opacity-50"
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
