import type { ReactNode } from "react";
import { hrefFor, MOBILE_ORDER, VIEWS, type ViewId } from "../lib/views";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({
  view,
  dateLabel,
  date,
  children,
}: {
  view: ViewId;
  dateLabel: string;
  date?: string;
  children: ReactNode;
}) {
  const mobileViews = MOBILE_ORDER.map(
    (id) => VIEWS.find((v) => v.id === id)!,
  );

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
        <ThemeToggle />
      </header>

      <div className="flex flex-1">
        {/* 사이드바 — PC 전용 */}
        <nav className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border p-3 md:flex">
          {VIEWS.map((item) => (
            <NavLink key={item.id} item={item} current={view} date={date} />
          ))}
        </nav>

        {/* 본문 — 하단 탭바에 가리지 않도록 모바일에서 아래 여백을 준다 */}
        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 md:pb-8">{children}</main>
      </div>

      {/* 하단 탭바 — 모바일 전용. 홈이 정중앙에 온다 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden">
        {mobileViews.map((item) => (
          <TabLink key={item.id} item={item} current={view} date={date} />
        ))}
      </nav>
    </div>
  );
}

function NavLink({
  item,
  current,
  date,
}: {
  item: (typeof VIEWS)[number];
  current: ViewId;
  date?: string;
}) {
  const active = item.id === current;
  const className = `flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm ${
    active
      ? "bg-accent/10 font-medium text-accent"
      : item.ready
        ? "text-foreground hover:bg-border/40"
        : "cursor-default text-muted opacity-50"
  }`;

  return item.ready ? (
    <a href={hrefFor(item.id, date)} className={className}>
      <span>{item.icon}</span>
      {item.label}
    </a>
  ) : (
    <span title="다음 단계에서 연결됩니다" className={className}>
      <span>{item.icon}</span>
      {item.label}
    </span>
  );
}

function TabLink({
  item,
  current,
  date,
}: {
  item: (typeof VIEWS)[number];
  current: ViewId;
  date?: string;
}) {
  const active = item.id === current;
  // 5등분이라 한 칸이 좁다. 라벨을 줄이지 않고 글자만 작게 둔다.
  const className = `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 ${
    active ? "text-accent" : item.ready ? "text-muted" : "text-muted opacity-40"
  }`;

  return item.ready ? (
    <a href={hrefFor(item.id, date)} className={className}>
      <span className="text-base leading-none">{item.icon}</span>
      <span className="text-[10px]">{item.label}</span>
    </a>
  ) : (
    <span className={className}>
      <span className="text-base leading-none">{item.icon}</span>
      <span className="text-[10px]">{item.label}</span>
    </span>
  );
}
