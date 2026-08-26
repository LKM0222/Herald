import type { ReactNode } from "react";
import type { LaunchItem } from "@shared/types";
import { useLoading } from "../lib/loading";
import {
  DESKTOP_TABS,
  findView,
  HEADER_VIEW,
  hrefFor,
  MOBILE_TABS,
  tabsIn,
  type ViewDef,
  type ViewId,
} from "../lib/views";
import { Launchpad } from "./Launchpad";
import { LoadingBar, TabSpinner } from "./Loading";
import { Logo } from "./Logo";
import { Tag } from "./ui";

export function AppShell({
  view,
  dateLabel,
  note,
  sample,
  date,
  launchpad,
  bleed,
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
  /**
   * 가운데 칸의 여백을 뷰가 **직접** 든다는 표시. 뉴스 본문만 그렇다 —
   * 층이 화면을 통째로 차지하며 스냅해서, 여백이 <main> 에 있으면 스냅 지점이
   * 그만큼 밀려 칸이 화면에 딱 맞지 않는다 (도면 5A · 6B).
   *
   * ⚠ "뉴스 탭인가" 가 아니라 "뉴스 **본문**이 그려지는가" 다. 같은 탭이라도
   *   기다리는 표시나 안내 상자가 대신 설 때는 그것들이 제 여백을 안 들고 있어서
   *   화면 왼쪽 위 모서리에 그대로 붙는다.
   */
  bleed?: boolean;
  children: ReactNode;
}) {
  const desktopTabs = tabsIn(DESKTOP_TABS);
  const mobileTabs = tabsIn(MOBILE_TABS);
  const headerView = findView(HEADER_VIEW)!;
  /*
    이 탭이 제 데이터를 기다리는 중인지 (lib/loading.tsx).
    show 는 250ms 를 넘긴 뒤에야 켜진다 — 눈 깜빡할 사이에 끝나는 요청까지
    진행선을 켜면 나타났다 사라지는 번쩍임만 남는다.
  */
  const { show: loading } = useLoading();

  return (
    /*
     * app-shell-frame(index.css) 이 **모든 폭에서** 높이를 뷰포트에 고정하고
     * overflow:hidden 을 건다. 헤더와 하단 탭바는 이 틀의 평범한 flex 자식이라
     * 저절로 붙박이가 되고, 가운데 <main> 만 구른다 (도면 6A~6D).
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
          {/*
            설정은 탭이 아니라 머리줄에 있다 — 모바일·PC 같은 자리다.
            밝기(라이트·다크·시스템)는 이 안으로 들어갔다: 겉모습 구획의 제목 오른쪽.
          */}
          <HeaderAction item={headerView} current={view} date={date} loading={loading} />
        </div>
      </header>

      {/* 이 줄이 남은 높이를 다 차지해야(min-h-0) 아래 main 의 overflow-y-auto 가
          실제로 넘친다 — 없으면 flex 자식은 내용 높이 밑으로 못 줄어들어
          바깥 틀의 overflow:hidden 이 그냥 잘라먹는다.
          도면 6A~6D 대로 이제 모든 폭에서 그렇다. 예전엔 md 부터만이었다. */}
      <div className="flex min-h-0 flex-1">
        {/* 사이드바 — PC 전용. 고정이라 md:min-h-0 을 안 주고 shrink-0 만 둔다 */}
        <nav className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-line py-4 md:flex">
          {desktopTabs.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              current={view}
              date={date}
              loading={loading}
            />
          ))}

          {/* 도면 3A 대로 런치패드가 내비 아래에 붙는다. 좁은 화면 몫은 홈이 맡는다. */}
          {launchpad && launchpad.length > 0 ? (
            <div className="mt-auto border-t border-line px-3 pt-5">
              <Launchpad items={launchpad} />
            </div>
          ) : null}
        </nav>

        {/*
          진행선을 걸 기준칸. <main> 자체에 걸면 선이 본문과 같이 굴러 올라가고,
          셸 바깥에 걸면 좌측 레일 폭(md 이상 176px)을 손으로 빼줘야 한다.
          여기 한 겹을 두면 두 도면이 저절로 맞는다 — 레일이 없는 좁은 화면에선
          머리줄 바로 아래 전체 폭(도면 9B), 레일이 서는 넓은 화면에선
          가운데 칸 위쪽(도면 8B).

          ⚠ 이 칸은 크기를 정하기만 하고 <main> 의 클래스는 한 글자도 안 건드린다.
            items-start · min-h-0 · min-w-0 가 <main> 에서 빠지면 아래 여백 40px 이
            통째로 사라진다 (d63e24b). 실측으로도 진행선이 떠 있을 때와 없을 때
            <main> 의 위치·크기가 완전히 같다.
        */}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          {loading ? <LoadingBar /> : null}

          {/*
            본문 — lg 미만에선 이 <main> 자체가 하나의 스크롤 영역이다. lg 부터는
            각 뷰가 내부에서 본문·스트립을 SCROLL_PANE(ui.tsx)으로 따로 쪼개고,
            그땐 이 높이에 정확히 맞춰 들어가 있어서(align-items:stretch) 이 main
            자체는 넘칠 게 없어져 스크롤바가 저절로 사라진다.

            ⚠ items-start 가 반드시 lg 미만에 있어야 한다. 이 main 은 flex 컨테이너(가로)
              라서 기본값 align-items:stretch 가 뷰 루트의 **높이를 main 의 높이로
              못박는다.** 그러면 진짜 내용은 루트 상자 밖으로 흘러나가고, 상자 밖으로
              나간 것에는 스크롤 컨테이너의 아래 여백(pb-10)이 안 붙는다 —
              마지막 요소가 하단 탭바에 0px 로 딱 붙어 버린다(실측: 40px → 0.3px).
              "브리핑이 없어요" 같은 안내 상자도 화면 높이만큼 늘어난다.
              lg 부터는 반대로 stretch 여야 SCROLL_PANE 이 굴러서 다시 켠다.
          */}
          <main
            data-scrollarea
            className={`flex min-h-0 min-w-0 flex-1 items-start overflow-y-auto lg:items-stretch ${
              bleed
                ? /*
                     뉴스 **본문**만 예외다. 층마다 화면을 통째로 차지하며 스냅하는데
                     (News.tsx), 여백이 여기 있으면 스냅 지점이 그만큼 밀려
                     칸이 화면에 딱 맞지 않는다 — 여백은 칸이 각자 든다 (도면 5A · 6B).
                  */
                  "px-0"
                : "px-4 pt-5 pb-10 sm:px-6"
            }`}
          >
            {children}
          </main>
        </div>
      </div>

      {/*
        하단 탭바 — 모바일 전용. 홈이 정중앙에 온다.
        ⚠ fixed 가 아니라 셸의 붙박이 자식이다(도면 6A~6D). fixed 였을 땐 본문이
          탭바 뒤로 흘러서 아래 여백(pb-24)으로 피해 줘야 했고, 그 여백이
          뉴스 탭 스냅 지점을 밀어 칸이 화면에 안 맞았다. 자리를 차지하게 두면
          <main> 높이에서 애초에 빠져 그 계산이 전부 사라진다.
      */}
      <nav className="flex shrink-0 border-t border-line bg-surface md:hidden">
        {mobileTabs.map((item) => (
          <TabItem
            key={item.id}
            item={item}
            current={view}
            date={date}
            loading={loading}
          />
        ))}
      </nav>
    </div>
  );
}

/**
 * 머리줄의 톱니 (도면 9A~9C 의 오른쪽 위). 탭 줄에서 빠진 설정이 여기 선다.
 *
 * ⚠ 아이콘만 있고 글자가 없다 — 그래서 **누르는 자리를 44px 로 따로 잡는다**.
 *   아이콘 크기(18px)만큼만 두면 폰에서 못 누른다 (CLAUDE.md).
 * ⚠ 기다리는 동안 아이콘을 도는 원으로 갈아 끼우는 건 하단 탭과 같은 문법이다
 *   (abdf079). 설정이 탭 줄에서 빠지면서 이 화면만 진행 표시가 없어질 뻔했다.
 */
function HeaderAction({
  item,
  current,
  date,
  loading,
}: {
  item: ViewDef;
  current: ViewId;
  date?: string;
  loading: boolean;
}) {
  const active = item.id === current;
  const { Icon } = item;
  const waiting = active && loading;

  return (
    <a
      href={hrefFor(item.id, date)}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? "page" : undefined}
      aria-busy={waiting || undefined}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line text-dim hover:bg-fg/[0.07] hover:text-fg"
      }`}
    >
      {waiting ? (
        <TabSpinner size={18} />
      ) : (
        <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      )}
    </a>
  );
}

/** 활성 표시를 왼쪽 세로선으로 준다 — 도면의 구획선과 같은 문법이다. */
function NavItem({
  item,
  current,
  date,
  loading,
}: {
  item: ViewDef;
  current: ViewId;
  date?: string;
  /** 지금 탭이 제 데이터를 기다리는 중인지 */
  loading: boolean;
}) {
  const active = item.id === current;
  const { Icon } = item;
  const waiting = active && loading;
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
      {/* 레일은 자리가 남아서 아이콘을 그대로 두고 오른쪽 끝에 원을 덧붙인다
          (도면 8A · 8B). 좁은 화면의 하단 탭은 자리가 없어 아이콘을 갈아 끼운다. */}
      {waiting ? (
        <span className="ml-auto">
          <TabSpinner size={14} />
        </span>
      ) : null}
    </>
  );

  return (
    <>
      {item.ready ? (
        <a
          href={hrefFor(item.id, date)}
          className={className}
          aria-busy={waiting || undefined}
        >
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
  loading,
}: {
  item: ViewDef;
  current: ViewId;
  date?: string;
  /** 지금 탭이 제 데이터를 기다리는 중인지 */
  loading: boolean;
}) {
  const active = item.id === current;
  const { Icon } = item;
  const waiting = active && loading;
  // 5등분이라 한 칸이 좁다. 라벨을 줄이지 않고 글자만 작게 둔다.
  const className = `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 ${
    active ? "text-accent" : item.ready ? "text-dim" : "text-dim opacity-40"
  }`;

  const body = (
    <>
      {/*
        아이콘을 도는 원으로 **갈아 끼운다** (도면 9B). 덧붙이지 않는 이유는
        한 칸이 5등분이라 자리가 없어서다 — 320px 에선 한 칸이 64px 뿐이다.
        원도 18px 이라 줄 높이가 그대로다.
      */}
      {waiting ? (
        <TabSpinner size={18} />
      ) : (
        <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      )}
      <span className="text-[10px] leading-none">{item.label}</span>
    </>
  );

  return item.ready ? (
    <a
      href={hrefFor(item.id, date)}
      className={className}
      aria-busy={waiting || undefined}
    >
      {body}
    </a>
  ) : (
    <span className={className}>{body}</span>
  );
}
