import type { ReactNode } from "react";
import type { LaunchItem } from "@shared/types";
import { hrefFor, MOBILE_ORDER, VIEWS, type ViewDef, type ViewId } from "../lib/views";
import { Launchpad } from "./Launchpad";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Tag } from "./ui";

export function AppShell({
  view,
  dateLabel,
  note,
  sample,
  date,
  launchpad,
  children,
}: {
  view: ViewId;
  dateLabel: string;
  /** "아침 8시 30분에 정리했어요" 같은 한 줄. 없으면 생략한다 */
  note?: string;
  sample?: boolean;
  date?: string;
  /** 브리핑을 못 불러온 화면에선 없다 */
  launchpad?: LaunchItem[];
  children: ReactNode;
}) {
  const mobileViews = MOBILE_ORDER.map((id) => VIEWS.find((v) => v.id === id)!);

  return (
    /*
     * app-shell-frame(index.css) 이 md 이상에서만 높이를 뷰포트에 고정하고
     * overflow:hidden 을 건다 — 그 아래는 지금처럼 페이지 전체가 스크롤된다.
     * 헤더는 이 틀의 평범한 flex 자식이라 저절로 붙박이가 된다.
     */
    <div className="app-shell-frame mx-auto flex w-full max-w-[1152px] flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
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

      {/* md 이상에서 이 줄 자체가 남은 높이를 다 차지해야(min-h-0) 아래 main 의
          overflow-y-auto 가 실제로 넘친다 — 없으면 flex 자식은 내용 높이 밑으로
          못 줄어들어 바깥 틀의 overflow:hidden 이 그냥 잘라먹는다. */}
      <div className="flex flex-1 md:min-h-0">
        {/* 사이드바 — PC 전용. 고정이라 md:min-h-0 을 안 주고 shrink-0 만 둔다 */}
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-line py-4 md:flex">
          {VIEWS.map((item) => (
            <NavItem key={item.id} item={item} current={view} date={date} />
          ))}

          {/* 도면 3A 대로 런치패드가 내비 아래에 붙는다. 좁은 화면 몫은 홈이 맡는다. */}
          {launchpad && launchpad.length > 0 ? (
            <div className="mt-auto border-t border-line px-3 pt-5">
              <Launchpad items={launchpad} />
            </div>
          ) : null}
        </nav>

        {/*
          본문 — 하단 탭바에 가리지 않도록 모바일에서 아래 여백을 준다.
          md 이상에선 이 <main> 자체가 하나의 스크롤 영역이 된다(뷰가 본문·스트립을
          아직 나란히 쪼개지 않는 md~lg 구간까지 담당). lg 부터는 각 뷰가 내부에서
          본문·스트립을 SCROLL_PANE(ui.tsx)으로 따로 쪼개고, 그땐 이 높이에
          정확히 맞춰 들어가 있어서(align-items:stretch) 이 main 자체는 넘칠 게
          없어져 스크롤바가 저절로 사라진다 — 그래서 lg 이상을 따로 갈라 끄지 않아도 된다.
        */}
        <main
          data-scrollarea
          className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:flex md:min-h-0 md:overflow-y-auto md:pb-10"
        >
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
