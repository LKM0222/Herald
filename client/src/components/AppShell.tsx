import type { ReactNode } from "react";
import { hrefFor, MOBILE_ORDER, VIEWS, type ViewDef, type ViewId } from "../lib/views";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Tag } from "./ui";

export function AppShell({
  view,
  dateLabel,
  note,
  sample,
  date,
  children,
}: {
  view: ViewId;
  dateLabel: string;
  /** "아침 8시 30분에 정리했어요" 같은 한 줄. 없으면 생략한다 */
  note?: string;
  sample?: boolean;
  date?: string;
  children: ReactNode;
}) {
  const mobileViews = MOBILE_ORDER.map((id) => VIEWS.find((v) => v.id === id)!);

  return (
    <div className="mx-auto flex w-full max-w-[1152px] flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        {/* 좁은 화면에선 날짜가 줄어들며 버틴다 — 브레이크포인트로 끊지 않는다 */}
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="h-6 w-auto shrink-0" />
          <span className="hidden font-display text-lg tracking-wide sm:inline">
            Herald
          </span>
          <span className="hidden h-5 w-px shrink-0 bg-line sm:block" />
          <span className="truncate font-display text-lg tracking-wide">
            {dateLabel}
          </span>
          {note ? (
            <span className="hidden shrink-0 text-xs text-dim lg:inline">
              {note}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {sample ? (
            <span className="hidden sm:block">
              <Tag tone="outline">샘플 데이터예요</Tag>
            </span>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1">
        {/* 사이드바 — PC 전용 */}
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-line py-4 md:flex">
          {VIEWS.map((item) => (
            <NavItem key={item.id} item={item} current={view} date={date} />
          ))}
        </nav>

        {/* 본문 — 하단 탭바에 가리지 않도록 모바일에서 아래 여백을 준다 */}
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10">
          {children}
        </main>
      </div>

      {/* 하단 탭바 — 모바일 전용. 홈이 정중앙에 온다 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface md:hidden">
        {mobileViews.map((item) => (
          <TabItem key={item.id} item={item} current={view} date={date} />
        ))}
      </nav>
    </div>
  );
}

/** 활성 표시를 왼쪽 세로선으로 준다 — 도면의 구획선과 같은 문법이다. */
function NavItem({
  item,
  current,
  date,
}: {
  item: ViewDef;
  current: ViewId;
  date?: string;
}) {
  const active = item.id === current;
  const { Icon } = item;
  const className = `flex min-h-10 items-center gap-2.5 border-l-2 px-4 text-sm ${
    active
      ? "border-accent bg-accent-soft font-medium text-accent"
      : item.ready
        ? "border-transparent hover:bg-fg/[0.05]"
        : "cursor-default border-transparent text-dim"
  }`;

  const body = (
    <>
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      {item.label}
    </>
  );

  return (
    <>
      {item.ready ? (
        <a href={hrefFor(item.id, date)} className={className}>
          {body}
        </a>
      ) : (
        <span className={className}>{body}</span>
      )}
      {item.ready ? null : (
        <span className="mb-1 px-4">
          <Tag>준비 중이에요</Tag>
        </span>
      )}
    </>
  );
}

function TabItem({
  item,
  current,
  date,
}: {
  item: ViewDef;
  current: ViewId;
  date?: string;
}) {
  const active = item.id === current;
  const { Icon } = item;
  // 5등분이라 한 칸이 좁다. 라벨을 줄이지 않고 글자만 작게 둔다.
  const className = `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 ${
    active ? "text-accent" : item.ready ? "text-dim" : "text-dim opacity-40"
  }`;

  const body = (
    <>
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      <span className="text-[10px] leading-none">{item.label}</span>
    </>
  );

  return item.ready ? (
    <a href={hrefFor(item.id, date)} className={className}>
      {body}
    </a>
  ) : (
    <span className={className}>{body}</span>
  );
}
