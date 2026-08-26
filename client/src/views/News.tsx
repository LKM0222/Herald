import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { formatKoreanDate, formatRelative, shiftISO } from "@shared/date";
import { AREA_IDS, type Area, type Briefing, type NewsItem, type Priority } from "@shared/types";
import { AREAS } from "@shared/sources";
import {
  Bookmark,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
} from "lucide-react";
import { NewsImage } from "../components/NewsImage";
import { SnapCarousel } from "../components/SnapCarousel";
import { Kicker, LinkButton, PendingButton, Tag } from "../components/ui";
import { hrefFor } from "../lib/views";

/**
 * 기사는 중요도로 3층을 이룬다.
 *
 * 층마다 담는 그릇을 바꾼다 — 1층은 펼친 구획, 2층은 표, 3층은 접힘.
 * 20건을 같은 카드에 평평하게 늘어놓으면 아무것도 안 읽는다.
 * 주제별로 묶지 않는 이유: 아침에 필요한 건 분류가 아니라 순서다.
 */
const TIERS: {
  priority: Priority;
  no: string;
  label: string;
  /**
   * 날짜줄의 건수 요약에 쓰는 짧은 이름 (도면 6B: "먼저 2 · 훑어 2 · 참고 2").
   * 층 이름을 두 벌 적는 게 아니라 **같은 층의 긴 이름 옆에 짧은 이름을 하나 더**
   * 둔 것이다 — 층이 늘거나 이름이 바뀌면 여기 한 줄만 고친다.
   */
  short: string;
}[] = [
  { priority: 1, no: "01", label: "먼저 볼 것", short: "먼저" },
  { priority: 2, no: "02", label: "훑어볼 것", short: "훑어" },
  { priority: 3, no: "03", label: "참고", short: "참고" },
];

/**
 * 칩 하나가 고르는 값. `"all"` 은 영역이 아니라 **안 거른 상태**다.
 *
 * 도면 7A 는 그날 실제로 붙은 topic 을 칩으로 늘어놓지만, 우리는 7B 쪽 —
 * 고정된 영역 다섯 칸 — 을 쓴다. 자리가 손에 기억되고, 어제 본 칩이 오늘
 * 사라지지 않는다. 대신 빈 영역이 생기는데 그건 숨기지 않고 그대로 보여준다.
 */
type Pick = "all" | Area;

/**
 * 영역이 없는 항목은 개발로 읽는다.
 *
 * ⚠ `area` 는 선택형이다 (shared/types.ts). 영역이 생기기 전 브리핑에는 필드가
 *   아예 없고, 그때는 전부 개발 뉴스였다. 수집이 아직 이 값을 안 채우는 동안은
 *   **모든 기사가 개발로 보이는 게 정상**이다 — 고장이 아니다.
 */
function areaOf(item: NewsItem): Area {
  return item.area ?? "dev";
}

/**
 * 고른 칩에 맞게 기사를 추린다.
 *
 * ⚠ **"전체" 에서 점수로 다시 정렬하지 않는다.** 점수는 영역 안에서만 뜻이 있다 —
 *   영역마다 다른 기준으로 매긴 값이라 개발 88 과 경제 88 은 견줄 수 없다
 *   (shared/types.ts 의 score 주석). 그래서 영역 순서대로 **이어 붙이기만** 하고,
 *   각 영역 안에서는 서버가 준 순서(층 → 점수)를 그대로 둔다.
 *   한 번이라도 flat 하게 sort 하면 서로 다른 자로 잰 값을 나란히 세우게 된다.
 */
function pickNews(news: NewsItem[], pick: Pick): NewsItem[] {
  if (pick !== "all") return news.filter((item) => areaOf(item) === pick);
  return AREA_IDS.flatMap((id) => news.filter((item) => areaOf(item) === id));
}

/**
 * 영역 칩 줄 (도면 6B · 7A).
 *
 * ⚠ **스크롤 영역 밖의 붙박이 줄이다.** 안에 두면 층을 굴릴 때 같이 흘러가
 *   사라진다 — 화면을 바꾸는 컨트롤이 화면을 바꿨다고 없어지면 안 된다.
 *   도면에서도 층이 01 → 02 → 03 으로 넘어가는 내내 이 줄은 제자리에 있다.
 *
 * ⚠ 좁은 화면에선 다섯 칸이 한 줄에 안 들어간다(320px 기준 실측). 줄바꿈 대신
 *   **가로로 굴린다** — 도면 6B 가 그렇고, 줄바꿈은 이 붙박이 줄의 높이를
 *   들쭉날쭉하게 만들어 아래 스냅 칸 높이까지 같이 흔든다.
 *   굴리는 건 이 띠 안쪽뿐이라 페이지가 가로로 넘치지는 않는다.
 */
function AreaChips({
  news,
  pick,
  onPick,
}: {
  news: NewsItem[];
  pick: Pick;
  onPick: (next: Pick) => void;
}) {
  const chips: { id: Pick; label: string; count: number }[] = [
    { id: "all", label: "전체", count: news.length },
    ...AREAS.map((area) => ({
      id: area.id as Pick,
      label: area.label,
      count: news.filter((item) => areaOf(item) === area.id).length,
    })),
  ];

  return (
    <div
      className="shrink-0 overflow-x-auto border-b border-line px-4 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="뉴스 영역"
    >
      <div className="flex w-max gap-2">
        {chips.map((chip) => {
          const active = chip.id === pick;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onPick(chip.id)}
              /*
                min-h-11 — 폰에서 누르는 것이다. CLAUDE.md 가 44px 밑으로 내리지
                말라고 못박아 뒀고, 도면의 칩은 그보다 납작하다.
                빈 영역도 죽이지 않는다 — 눌러서 "없다" 를 확인할 수 있어야
                오늘 그 영역이 빈 건지 내가 잘못 본 건지가 갈린다.
              */
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 font-display text-sm whitespace-nowrap transition-colors ${
                active
                  ? "border-accent bg-accent text-bg"
                  : "border-line hover:bg-fg/[0.07] active:bg-fg/[0.14]"
              } ${chip.count === 0 && !active ? "text-dim" : ""}`}
            >
              {chip.label}
              <span
                className={`tabular-nums ${active ? "opacity-80" : "text-dim"}`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 세로 스냅을 켜는 표시를 `<html>` 에 달았다 뗀다.
 *
 * 스냅이 걸릴 곳은 `<main>` 하나지만, 표시는 `<html>` 에 단다 — CSS 가
 * `.news-snap main[data-scrollarea]` 로 잡기 때문이고, JSX 로는 `<html>` 에
 * 손이 닿지 않아 여기서 달았다 뗀다.
 *
 * 뉴스 탭에서만 켜는 이유: scroll-snap-align 은 가로·세로를 한꺼번에 정하는
 * 속성이라, 문서에 세로 스냅을 상시로 걸면 홈의 가로 캐러셀 카드(snap-start)가
 * 세로로도 걸려 홈 스크롤이 카드마다 끊긴다.
 */
function useVerticalSnap() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("news-snap");
    return () => root.classList.remove("news-snap");
  }, []);
}

/**
 * 스냅이 걸린 스크롤 컨테이너 — 뿌리 안쪽의 [data-news-scroll] 이다.
 *
 * <main> 이 아니다. 날짜줄을 스크롤 밖에 붙박이로 두려고 한 겹 안으로 들어갔다.
 */
function scrollerFor(root: HTMLElement | null): HTMLElement | null {
  return root;
}

/**
 * 지금 몇 번째 층에 서 있는지. 오른쪽 도트가 이 값을 쓴다.
 *
 * 칸 폭을 나눗셈으로 넘겨짚지 않고 **화면 꼭대기에 가장 가까운 칸**을 고른다
 * (SnapCarousel 의 nearestIndex 와 같은 문법이다). 칸 높이가 내용에 따라
 * 늘어날 수 있어서 — min-height 라 그렇다 — 나눗셈은 어긋난다.
 *
 * ⚠ 칸에 tierIn 의 translateY 가 걸려 있어 rect.top 이 최대 28px 밀린다.
 *   스냅이 늘 칸 꼭대기에 세워 주므로 멈춘 자리에서는 정확하고, 구르는
 *   도중에만 잠깐 흔들린다 — 도트는 멈춘 자리만 맞으면 된다.
 */
function useActiveTier(
  root: RefObject<HTMLDivElement | null>,
  count: number,
): number {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const scroller = scrollerFor(root.current);
    if (!scroller || count === 0) return;

    const read = () => {
      const panels = [
        ...(root.current?.querySelectorAll<HTMLElement>(".news-panel") ?? []),
      ];
      const portTop = scroller.getBoundingClientRect().top;
      let nearest = 0;
      let best = Infinity;
      panels.forEach((panel, index) => {
        const distance = Math.abs(panel.getBoundingClientRect().top - portTop);
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      setActive(nearest);
    };

    scroller.addEventListener("scroll", read, { passive: true });
    read();
    return () => scroller.removeEventListener("scroll", read);
  }, [root, count]);

  return active;
}

export function News({
  briefing,
  date,
  today,
}: {
  briefing: Briefing;
  date: string;
  today: string;
}) {
  useVerticalSnap();

  const [pick, setPick] = useState<Pick>("all");
  const visible = pickNews(briefing.news, pick);

  // priority 가 없는 항목(수집만 되고 요약 전)은 맨 아래 층으로 보낸다.
  const byTier = TIERS.map((tier) => ({
    ...tier,
    items: visible.filter((item) => (item.priority ?? 3) === tier.priority),
  }));
  const filled = byTier.filter((tier) => tier.items.length > 0);

  const rootRef = useRef<HTMLDivElement>(null);
  const active = useActiveTier(rootRef, filled.length);

  /*
    칩을 바꾸면 맨 위 층부터 다시 본다.
    안 되돌리면 3층을 보다가 기사가 두 건뿐인 영역으로 갈아탔을 때 스크롤이
    그대로 남아, 칸이 없어진 자리에서 빈 화면을 보게 된다.

    ⚠ setPick 옆에서 곧바로 scrollTo 를 부르면 **안 먹는다.** 그 순간 DOM 은 아직
      옛 층 목록이라 0 으로 가긴 가는데, 바로 뒤 React 가 층을 하나 **위에**
      끼워 넣으면 (개발엔 1층이 없고 게임엔 있다) 브라우저가 "보고 있던 칸" 을
      제자리에 붙잡아 두려고 스크롤을 그만큼 도로 밀어 준다 — 스크롤 앵커링과
      스냅 재조준이 둘 다 그렇게 동작한다. 층은 key={priority} 라 옛 칸의 DOM
      노드가 그대로 살아남아서 붙잡을 것이 있다.

      그래서 DOM 이 바뀐 **뒤에**, 그리고 그리기 전에 되돌린다.
      · useLayoutEffect  — 커밋 후 · 페인트 전. useEffect 면 한 프레임 깜빡인다
      · scrollHeight 읽기 — 브라우저가 앵커링·재조준을 여기서 먼저 끝내게 한다.
        그 뒤에 0 을 넣어야 우리 값이 마지막이 된다
      · behavior:"instant" — 부드럽게 굴러가는 동안 스냅이 끼어들지 못하게
      (앵커링 자체는 index.css 의 overflow-anchor:none 으로도 막아 뒀다)
  */
  useLayoutEffect(() => {
    const scroller = rootRef.current;
    if (!scroller) return;
    void scroller.scrollHeight;
    scroller.scrollTo({ top: 0, behavior: "instant" });
    // 날짜가 바뀌어도 같다 — 그날 층 구성이 통째로 달라진다.
  }, [pick, date]);

  // 지난 날짜를 보고 있을 때만 나온다. 도면엔 없지만 이게 없으면 오늘로 돌아올
  // 길이 화면에서 사라진다 — 예전엔 층 머리띠가 들고 있던 링크다.
  const backToToday =
    date !== today ? (
      <a
        href={hrefFor("news", today)}
        className="shrink-0 self-start text-xs text-accent hover:underline"
      >
        오늘로 가기 →
      </a>
    ) : null;

  return (
    /*
     * h-full — 칸 높이(.news-panel 의 min-height:100%)가 풀리려면 이 뿌리가
     * 확정된 높이를 들고 있어야 한다. 퍼센트는 "높이가 정해진 조상" 을 찾아
     * 올라가는데, 여기서 auto 로 끊기면 칸이 내용 높이로 주저앉아 스냅이
     * 통째로 무너진다. 예전엔 md 부터만이었다 — 그 아래선 문서가 굴렀다.
     */
    <div className="flex h-full w-full min-w-0 flex-col">
      <DateBar date={date} today={today} tiers={byTier} />
      {/*
        칩 줄도 스크롤 밖이다 — 날짜줄과 같은 이유로 붙박이 행이다.
        기사가 아예 없는 날엔 고를 것이 없으니 줄 자체를 안 세운다.
      */}
      {briefing.news.length > 0 ? (
        <AreaChips news={briefing.news} pick={pick} onPick={setPick} />
      ) : null}
      {/*
        구르는 건 이 안쪽이다 — 날짜줄은 밖에 남아 붙박이가 된다 (도면 5A).
        <main> 을 그대로 굴리면 날짜줄도 같이 흘러가고, sticky 로 붙잡으면
        칸이 그 밑에 깔려 스냅 지점이 어긋난다.
      */}
      <div ref={rootRef} data-news-scroll className="flex min-h-0 flex-1 flex-col">
      {visible.length === 0 ? (
        <SnapPanel first>
          <Kicker>오늘 볼 것</Kicker>
          <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-dim">
            {/*
              하루가 통째로 빈 것과 **고른 영역만** 빈 것은 다른 말이다.
              뭉뚱그리면 칩을 잘못 눌러 놓고 오늘 뉴스가 없는 줄 안다.
            */}
            {briefing.news.length === 0
              ? "오늘 모인 기사가 없습니다."
              : "오늘은 이 영역에 올라온 기사가 없어요."}
          </p>
          {backToToday}
        </SnapPanel>
      ) : (
        filled.map((tier, order) => (
          <SnapPanel key={tier.priority} first={order === 0}>
            {/*
              층 이름이 건수를 같이 들고 있다(도면 5A). 예전엔 첫 칸 위에
              "6건 · 3층" 머리띠가 따로 섰는데, 오른쪽 도트가 이미 몇 층 중
              몇 번째인지 말해줘서 같은 말을 두 번 하는 자리가 됐다.
              머리띠를 걷어낸 자리만큼 기사가 위로 올라온다.
            */}
            {tier.priority === 3 ? null : (
              <div className="flex shrink-0 items-center gap-2.5">
                <h3
                  className={`font-display text-sm uppercase tracking-[0.1em] ${
                    tier.priority === 1 ? "text-accent" : "text-dim"
                  }`}
                >
                  {tier.no} · {tier.label}{" "}
                  <span className="text-dim">{tier.items.length}건</span>
                </h3>
                <span className="h-px flex-1 bg-line" />
                {order === 0 ? backToToday : null}
              </div>
            )}

            {tier.priority === 1 ? (
              /*
                1층은 좌우로 넘긴다(도면 5A). 두 장을 나란히 세우면 서로
                크기를 깎아먹어 "먼저 볼 것" 이 먼저로 안 읽힌다.
                넘기는 동작은 홈과 같은 SnapCarousel 을 쓴다.

                fill — 이 칸은 화면을 통째로 차지한다. 카드가 제 내용 높이로
                서면 아래가 휑하게 남아 "가득 찬 한 화면" 이 안 된다.
              */
              <SnapCarousel
                fill
                count={tier.items.length}
                label={(index) => `먼저 볼 것 ${index + 1}번째`}
              >
                {tier.items.map((item, index) => (
                  <LeadCard
                    key={item.id}
                    item={item}
                    index={index + 1}
                    total={tier.items.length}
                  />
                ))}
              </SnapCarousel>
            ) : tier.priority === 2 ? (
              <SkimList items={tier.items} />
            ) : (
              <>
                <ReferenceFold tier={tier} />
                {order === 0 ? backToToday : null}
              </>
            )}
          </SnapPanel>
        ))
      )}

      </div>
      <TierDots tiers={filled} active={active} root={rootRef} />
    </div>
  );
}

/**
 * 스냅 한 칸 = 층 하나.
 *
 * 원래 세 층이 죽 이어져 있어서, 스크롤을 멈춘 자리가 어느 층인지 매번 다시
 * 찾아야 했다. 이제 한 층이 화면을 통째로 차지하고 다음 층은 한 번 굴리면
 * 딱 끊어 들어온다 — 어디까지 봤는지가 스크롤 위치가 아니라 화면 자체로 남는다.
 *
 * 실제로 걸리는 규칙(높이 · 스냅 · 떠오르는 애니메이션)은 index.css 의
 * `.news-panel` 에 있다.
 *
 * ⚠ **여백은 네 방향 다 여기서 준다** (도면 5A · 6B: 20px 24px 24px / 20px 16px 24px).
 *   `<main>` 에 두면 안 된다 — 위아래 여백이 스냅 지점을 밀어서 칸이 화면에
 *   딱 안 맞는다. 그래서 `<main>` 을 px-0 으로 비웠는데, 그때 좌우까지 같이
 *   비어 버려 층 제목이 화면 왼쪽 끝에 붙고 카드가 4px 밖으로 나갔다.
 *   한쪽만 옮기면 안 되는 짝이다.
 *
 * ⚠ shrink-0 — 이 칸들은 세로 flex 자식이다. 없으면 형제 칸에 눌려
 *   min-height 아래로 찌그러지고, 그 순간 "한 칸 = 한 화면" 이 깨진다.
 */
function SnapPanel({
  first = false,
  children,
}: {
  /** 첫 칸은 위 여백을 조금 줄인다 — 머리글이 화면 꼭대기에 붙어 보이게 */
  first?: boolean;
  children: ReactNode;
}) {
  return (
    /*
      전부 상단 정렬이다(도면 5A: justify-content flex-start). 가운데로 모으면
      층마다 글이 시작하는 높이가 달라서, 넘길 때마다 눈이 첫 줄을 다시 찾는다.
      위를 맞춰 두면 층이 바뀌어도 시선이 한자리에 선다.
    */
    <section
      className={`news-panel flex shrink-0 flex-col px-4 sm:px-6 ${
        first ? "gap-5 pb-6 pt-5" : "gap-3.5 py-6"
      }`}
    >
      {children}
    </section>
  );
}

/**
 * 기사 점수 (summarize.ts 의 TIERS 가 이 값으로 층을 나눈다).
 *
 * 층이 이미 점수대를 말하지만 같은 층 안에서도 90 과 99 는 다르다.
 * 숫자를 같이 두면 "왜 이게 위에 있나" 를 따로 묻지 않아도 된다.
 * 요약 전 기사는 점수가 없다 — 그때는 자리를 차지하지 않는다.
 */
function Score({ value }: { value?: number }) {
  if (value === undefined) return null;
  return (
    <span
      className="shrink-0 font-display text-[13px] font-semibold text-accent tabular-nums"
      title={`중요도 ${value}점`}
    >
      {value}
    </span>
  );
}

/**
 * 스크롤 영역 위에 붙박이로 서는 날짜 줄 (도면 5A · 6B).
 *
 * 무엇을 보고 있는지(날짜)와 오늘 몇 건인지(층별 건수)를 한 줄에 둔다.
 * 칸을 넘길 때마다 헤더가 바뀌지 않으니, 지금 몇 층인지는 도트가 말하고
 * **어느 날 기사인지**는 여기가 계속 말한다.
 *
 * ⚠ 예전엔 md 미만에서 통째로 숨겼다 — "앱 헤더가 이미 날짜를 달고 있어서
 *   같은 말을 두 번 한다" 는 이유였는데, 도면 6B 는 좁은 화면에도 이 줄을
 *   그린다. 머리줄의 날짜와 여기 날짜는 **다른 말이다**: 머리줄은 "오늘이
 *   며칠인가", 여기는 "지금 보고 있는 기사가 어느 날 것인가" 다. 둘이 갈리는
 *   순간(지난 날짜를 열었을 때)이 정확히 이 줄이 필요한 순간이고,
 *   숨겨 뒀던 탓에 **폰에서는 날짜를 옮길 방법이 아예 없었다.**
 *
 * ⚠ 스크롤 영역 **밖**의 붙박이 행이다 (칩 줄과 같다). 안에 넣으면 층을
 *   굴릴 때 같이 흘러가고, 스냅 지점도 이 줄 높이만큼 어긋난다.
 *
 * ⚠ 좁은 화면에서 이 줄은 **한 줄이다** (도면 6B · 9A: 제목 옆에 건수, 오른쪽
 *   끝에 32px 버튼, padding 10px 16px 0, 아래 테두리 없음). 두 줄로 쌓았을 땐
 *   61px 이었는데, 그 높이는 글이 아니라 **44px 버튼**이 정하고 있었다 —
 *   글만 한 줄로 눕혀도 1px 도 안 줄어든다. 버튼을 도면대로 32px 로 내려야
 *   실제로 줄어들고, 그만큼이 아래 스냅 칸(1층 카드)으로 돌아간다.
 *   대신 **누르는 자리는 44px 로 남긴다** — index.css 의 `.date-step` 이
 *   보이는 크기는 그대로 두고 가짜 요소로만 넓힌다 (도트와 같은 문법).
 *
 * ⚠ md 부터는 예전 그대로다. 6B 는 모바일 도면이고, 데스크탑 날짜 줄은
 *   긴 층 이름 · 날짜 알약 · 아래 테두리 · py-3 을 그대로 들고 있어야 한다.
 */
function DateBar({
  date,
  today,
  tiers,
}: {
  date: string;
  today: string;
  tiers: { priority: Priority; label: string; short: string; items: NewsItem[] }[];
}) {
  /*
    도면 6B 의 제목은 **요일이 없다** ("8월 25일 기사"). 머리줄이 이미 요일까지
    달고 있어서 같은 줄에 또 적을 이유가 없고, 320px 에서는 그 네 글자가
    오른쪽 건수를 그대로 밀어낸다 (실측: 요일이 있으면 건수가 5px 모자라
    "참고 33" 이 잘렸다).

    그래서 자르는 게 아니라 **md 부터만 덧붙인다.** 포맷이 바뀌어 괄호가
    사라지면 정규식이 안 맞아 덧붙일 게 없어질 뿐, 날짜는 그대로 남는다.
  */
  const full = formatKoreanDate(date);
  const stem = full.replace(/\s*\([^)]*\)\s*$/, "");
  const weekday = full.slice(stem.length);

  return (
    /*
      좌우 여백은 칩 줄과 같은 값을 쓴다 (px-4 sm:px-6) — 두 붙박이 행의 글이 세로로 맞는다.

      위아래는 도면의 10px / 0 이 아니라 10px / 6px 이다. 6px 은 버튼의 44px
      누름자리가 아래로 삐져나갈 자리다 — 0 으로 두면 그 6px 이 칩 줄의 위
      여백을 덮어, 칩 바로 위를 눌렀을 때 하루 전으로 넘어간다.
    */
    <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-2.5 pb-1.5 sm:px-6 md:border-b md:border-line md:py-3">
      {/* 도면 6B: 제목과 건수가 baseline 으로 한 줄에 선다 (gap 8px) */}
      <span className="flex min-w-0 items-baseline gap-2 md:gap-2.5">
        {/* shrink-0 + truncate — 안 줄어드니 실제로 잘릴 일은 없다. truncate 를
            남겨 두는 건 md 부터의 글상자를 예전과 1px 도 다르지 않게 두려는
            것이다 (overflow:hidden 이 줄상자 높이를 바꾼다 — 실측 23 vs 21) */}
        {/*
          ⚠ text-sm 이 아니라 text-[14px] 다. 크기는 같지만 text-sm 은 줄간격까지
            같이 정하는데, md:text-[15px] 는 **크기만** 바꾸는 임의값이라
            그 줄간격이 데스크탑까지 따라와 글상자가 23 → 21px 로 줄었다(실측).
            임의값끼리 두면 양쪽 다 본문 줄간격(1.55)을 그대로 물려받는다.
        */}
        <span className="shrink-0 truncate font-display text-[14px] font-semibold md:text-[15px]">
          {stem}
          <span className="hidden md:inline">{weekday}</span> 기사
        </span>
        {/* 좁은 화면에서 먼저 잘리는 쪽은 건수다 — 날짜가 잘리면 무슨 날인지가 사라진다 */}
        <span className="truncate text-[11px] text-dim md:text-xs">
          {tiers.map((tier, index) => (
            <span key={tier.priority}>
              {index > 0 ? " · " : ""}
              {/* 1층만 색을 준다 — 오늘 꼭 봐야 할 게 몇 건인지가 먼저 눈에 걸려야 한다 */}
              <span
                className={
                  tier.priority === 1
                    ? "font-semibold text-accent"
                    : tier.priority === 2
                      ? "font-semibold"
                      : ""
                }
              >
                {/*
                  같은 층을 좁은 화면에선 짧게 부른다 (도면 6B "먼저 2 · 훑어 2 · 참고 2").
                  건수는 한 번만 적고 이름만 갈아 끼운다 — 숫자를 두 벌 적으면
                  한쪽만 고쳐서 어긋난다.
                */}
                <span className="lg:hidden">{tier.short}</span>
                <span className="hidden lg:inline">{tier.label}</span>{" "}
                {tier.items.length}
              </span>
            </span>
          ))}
        </span>
      </span>

      {/*
        gap-3(12px) — 버튼 둘의 44px 누름자리가 서로 6px 씩 이 틈으로 넓어져
        정확히 맞닿는다. 더 좁히면 겹쳐서, 사이를 눌렀을 때 어제로 갈지
        내일로 갈지가 DOM 순서로 정해진다 (도트와 같은 함정).
        md 부터는 누름자리를 안 넓히므로 예전 간격(6px)으로 되돌린다.
      */}
      <div className="flex shrink-0 items-center gap-3 md:gap-1.5">
        <DayStep to={shiftISO(date, -1)} label="하루 전">
          <ChevronLeft size={15} strokeWidth={1.5} />
        </DayStep>
        {/*
          날짜 알약. 좁은 화면에선 숨긴다 — 왼쪽 제목이 이미 같은 날짜를 말하고
          있고, 320px 에서 이것까지 세우면 제목이 밀려 잘린다 (실측).
          누르는 것이 아니라 읽는 것이라 44px 규칙의 대상이 아니다.
        */}
        <span className="hidden min-h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-mid sm:inline-flex">
          <CalendarDays size={14} strokeWidth={1.5} aria-hidden="true" />
          {date}
        </span>
        {/* 내일 기사는 없다. 오늘이면 앞으로 가는 길을 막는다 */}
        <DayStep to={date < today ? shiftISO(date, 1) : null} label="하루 뒤">
          <ChevronRight size={15} strokeWidth={1.5} />
        </DayStep>
      </div>
    </div>
  );
}

function DayStep({
  to,
  label,
  children,
}: {
  to: string | null;
  label: string;
  children: ReactNode;
}) {
  /*
    보이는 크기는 **모든 폭에서 32px** 이다 (도면 6B · 9A: width/height 32px,
    border-radius 8px). 폰에서 44px 로 키웠던 적이 있는데, 그러면 날짜 줄 높이가
    통째로 44px 에 묶여 도면의 납작한 한 줄이 안 나온다.

    누르는 자리는 그대로 44px 다 — `.date-step`(index.css)이 md 미만에서 가짜
    요소로 사방 6px 씩 넓힌다. 도트(.news-dot)와 같은 문법이고, 레이아웃을
    밀지 않아서 줄 높이에 영향이 없다.
  */
  const shape =
    "date-step inline-flex size-8 items-center justify-center rounded-lg border border-line text-mid";
  if (!to) {
    return (
      <span className={`${shape} opacity-35`} aria-hidden="true">
        {children}
      </span>
    );
  }
  return (
    <a href={hrefFor("news", to)} aria-label={label} className={shape}>
      {children}
    </a>
  );
}

/**
 * 오른쪽 가장자리의 스냅 도트 (도면 5A).
 *
 * 스크롤바를 지운 자리를 대신한다. 스크롤바는 "얼마나 남았나" 를 픽셀로
 * 말하는데, 이 화면에서 알고 싶은 건 거리가 아니라 **몇 층 중 몇 번째냐** 다.
 * 도트가 그 셋을 그대로 그린다. 홈의 가로 캐러셀 도트와 같은 문법을 세로로 세운 것.
 *
 * ⚠ absolute 인데 <main> 안에 있어도 같이 흘러가지 않는다. 기준(containing
 *   block)이 .app-shell-frame 이라 <main> 의 overflow 바깥이기 때문이다.
 *   예전엔 fixed + right:max(12px, calc(50% - 564px)) 로 창 폭을 손계산했는데,
 *   틀이 relative 를 갖게 되면서 도면대로 right:12px 하나면 끝난다.
 */
function TierDots({
  tiers,
  active,
  root,
}: {
  tiers: { no: string; label: string }[];
  active: number;
  root: RefObject<HTMLDivElement | null>;
}) {
  // 층이 하나뿐이면 넘길 곳이 없다. 있는 척하지 않는다.
  if (tiers.length < 2) return null;

  return (
    <div
      className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2"
      role="tablist"
      aria-label="뉴스 층"
    >
      {tiers.map((tier, index) => (
        <button
          key={tier.no}
          type="button"
          role="tab"
          aria-selected={index === active}
          aria-label={`${tier.no} · ${tier.label}`}
          onClick={() => {
            const panels =
              root.current?.querySelectorAll<HTMLElement>(".news-panel");
            // scrollIntoView 를 쓴다 — 여기선 세로로 옮기는 게 목적이라
            // SnapCarousel 이 이걸 피한 이유(세로까지 건드림)가 반대로 작동한다.
            panels?.[index]?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
          className={`news-dot w-1.5 rounded-full transition-all ${
            index === active ? "h-[22px] bg-accent" : "h-1.5 bg-line"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * 1층 카드.
 *
 * **한 카드가 두 도면을 산다.** lg 미만은 도면 6B(한 단: 머리 · 이미지 · 요약 ·
 * 버튼), lg 부터는 도면 5A · 7A(두 단: 글 왼쪽 · 이미지 오른쪽)다. 둘은 같은
 * 정보를 다른 순서로 세우기 때문에, 자리를 옮겨야 하는 조각들은 두 벌 두고
 * CSS 로 한쪽만 남긴다 — NewsImage 슬롯이 이미 쓰던 방식 그대로다.
 *
 * 두 도면이 실제로 갈리는 곳:
 * · 출처·시각·원제 — 5A 는 맨 윗줄과 제목 밑, 6B 는 **요약 상자 아래 캡션 한 줄**
 * · 주제 — 5A 는 윗줄 글 속에, 6B 는 킥커 옆 **알약**
 * · 머리 블록 — 6B 는 킥커+제목을 묶어 아래에 구분선을 긋는다
 * · 요약 상자 — 6B 는 **104px 로 못박고 그 안에서 구른다**
 * · 버튼 줄 — 6B 는 위에 구분선을 긋고 원문이 남는 폭을 다 먹는다
 *
 * 경계를 lg 로 잡은 이유: 카드가 두 단이 되는 지점이 lg 라서다. 그 아래는
 * 폭이 얼마든 6B 와 같은 한 단짜리 카드다.
 */
function LeadCard({
  item,
  index,
  total,
}: {
  item: NewsItem;
  index: number;
  total: number;
}) {
  const extra = item.alsoIn?.length ?? 0;
  const alsoIn = extra > 0 ? ` · 다른 매체 ${extra}곳` : "";

  return (
    /*
       ⚠ 여기엔 max-w 를 두지 않는다 (도면 5A · 6B: h4·p 에 max-width 없음).
         카드 자체가 이미 칸 안에서 폭을 정하고 있어서, 글줄까지 또 묶으면
         카드는 넓은데 글만 왼쪽 3분의 1에 몰려 오른쪽이 휑하게 빈다.
         홈 카드는 다른 컴포넌트이고 거기선 그대로 둔다 — 카드가 좁아서
         글줄 제한이 실제로 걸릴 일이 없다.
    */
    <article className="flex w-full shrink-0 snap-start flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 sm:p-7 lg:flex-row lg:gap-6">
      {/*
        글 단. lg 부터 카드가 두 단이 되고(도면 7A "카드뉴스 2단") 이 단이 왼쪽,
        이미지가 오른쪽에 선다. 그 아래에선 도면 6B 대로 세로로 쌓이고,
        이미지는 제목과 내용 **사이**에 들어간다 (6B: 주제 칩 · 제목 · 이미지 · 내용 3단).

        ⚠ min-w-0 — flex 아이템의 기본 min-width 는 auto 라 긴 표제가 단을 밀어
          카드를 통째로 넓힌다. 그러면 캐러셀이 가로로 새어 나간다.

        ⚠ flex-1 을 두 폭에서 다 건다. lg 에서는 **가로**로(두 단 중 왼쪽),
          그 아래에서는 **세로**로 작동해 이 단이 카드 높이를 채운다.
          안 채우면 아래 버튼 줄의 mt-auto 가 밀 자리가 없어 무효가 되고,
          이미지 슬롯의 flex-1 도 나눠 가질 여백을 못 찾는다.
      */}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
      {/*
        머리 블록 (도면 6B: gap 8px · 아래 구분선 · padding-bottom 12px).
        lg 에선 이 묶음이 없던 것처럼 보여야 해서 구분선을 걷고 간격만
        예전 부모 간격(14px)으로 되돌린다 — 묶기 전과 픽셀이 같아진다.
      */}
      <div className="flex flex-col gap-2 border-b border-line pb-3 lg:gap-3.5 lg:border-b-0 lg:pb-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <Kicker tone="accent">
          먼저 볼 것 · {String(index).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </Kicker>
        {/* 6B 는 주제를 킥커 옆 알약으로 세운다. lg 는 5A 대로 오른쪽 글줄 안에 둔다 */}
        {item.topic ? (
          <span className="lg:hidden">
            <Tag tone="accent">{item.topic}</Tag>
          </span>
        ) : null}
        <span className="hidden h-px flex-1 bg-line lg:block" />
        <span className="hidden text-[11px] text-dim break-keep lg:inline">
          {item.source} · {formatRelative(item.publishedAt)}
          {item.topic ? ` · ${item.topic}` : ""}
          {alsoIn}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* 23px — 도면 6B 의 h4. lg 부터는 두 단이라 글줄이 짧아져 더 키운다 */}
        <h4 className="font-display text-[23px] leading-[1.18] break-keep sm:text-[31px]">
          {/*
            점수를 제목 안에 둔다 — 밖에 두면 제목이 두 줄일 때 따로 논다.
            ⚠ 도면 6B 에는 점수가 아예 없다. 도면이 점수 없는 가짜 기사로
              그려져서지, 빼라는 뜻이 아니다 — 2층 목록도 같은 자리에 점수를
              달고 있고, 그걸 지우면 "왜 이게 위에 있나" 를 물을 근거가 사라진다.
          */}
          {item.score !== undefined ? (
            <span className="mr-2.5 align-[0.15em] text-base font-semibold text-accent tabular-nums sm:text-lg">
              {item.score}
            </span>
          ) : null}
          {item.headline ?? item.title}
        </h4>
        {/* 표제가 없으면 위가 이미 원제다. 같은 문장을 두 번 쓰지 않는다.
            lg 만이다 — 6B 에선 원제가 요약 아래 캡션 줄로 내려간다 */}
        {item.headline ? (
          <p className="hidden text-xs leading-[1.4] text-dim lg:block">
            원제 · {item.title}
          </p>
        ) : null}
      </div>
      </div>

      {/*
        모바일 이미지 자리 — 제목과 내용 사이 (도면 6B).

        ⚠ 슬롯이 둘인 이유: 좁은 화면에선 이 자리가 글 단 **안**이고, lg 부터는
          글 단 **밖**의 오른쪽 단이다. 한 요소로는 두 자리에 동시에 있을 수 없어
          각각 두고 CSS 로 한쪽만 남긴다 — Logo.tsx 가 밝기별 로고를 다루는 방식과
          같은 문법이다. 두 슬롯이 같은 주소를 가리키니 실제로 받아오는 건 한 번이다.

        높이는 144px 로 못박는다 (도면 6B 실측 ≈150px).

        ⚠ 줄어드는 높이(flex-1 + max-h)로도 해 봤는데 **아무 효과가 없다.**
          칸은 `min-height:100%` 라 높이가 확정된 상자가 아니고(index.css),
          확정된 높이가 없으면 flex 가 나눠 줄 여백 자체를 못 만든다 —
          슬롯은 늘 max 값에 붙어 있었다. 그래서 고정으로 되돌렸다.

        ⚠ 대신 세로가 짧은 폰에서는 1층 칸이 화면보다 커져 칸 안에서 한 번 더
          굴리게 된다 (실측: 390×844 는 659=659 로 딱 맞고, 375×667 은 619>482,
          320×568 은 698>383). 이건 `min-height:100%` 가 원래 허용하는 동작이라
          — 기사가 길면 칸이 늘어난다 — 새로 생긴 고장이 아니다. 글도 버튼도
          잘리지 않고 그대로 닿는다(실측 확인).
      */}
      {/* 도면 6B: 이미지 자리에 1px 테두리가 있다 (오른쪽 단인 lg 쪽엔 없다) */}
      <NewsImage
        item={item}
        className="flex h-36 w-full shrink-0 border border-line lg:hidden"
      />

      {/*
        요약 + 캡션 묶음 (도면 6B: flex:1 · min-height:0 · gap 8px).

        lg 에선 `contents` 로 이 묶음을 통째로 지운다 — 상자가 다시 글 단의
        직계 자식이 되어 예전과 픽셀이 같아진다. 캡션은 어차피 lg:hidden 이다.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:contents">
      {/*
        요약과 "왜 중요한가" 를 한 상자에 담는다.
        ⚠ 예전엔 요약이 상자 위 맨 문단이었다. 그러면 카드에 글 덩어리가 둘이 되어
          어느 쪽을 먼저 읽어야 하는지가 흐려진다. 한 상자에 넣고 안에서만 나눈다.
        ⚠ 둘 다 없으면 아예 안 그린다 — 요약 단계를 안 거친 기사가 그렇고,
          그때 빈 색 상자만 남으면 고장 난 것처럼 보인다.

        ⚠ **높이를 104px 로 못박는다** (도면 6B 원문: height:104px; overflow-y:auto).
          여기가 1층 카드가 한 화면에 안 들어가던 진짜 이유였다 — 요약이 길면
          상자가 그대로 늘어나 카드를 밀어냈다 (실측 390×844: 상자 214px,
          칸 713px > 스크롤 칸 609px). 도면대로 못박으면 609 = 609 로 딱 맞는다.
          넘치는 글은 사라지지 않고 상자 안에서 구른다 (.summary-scroll).
          lg 부터는 카드가 두 단이라 세로가 남는다 — 거기선 예전처럼 늘어난다.
      */}
      {item.summary || item.relevance ? (
        <div className="summary-scroll flex h-26 shrink-0 flex-col gap-2 overflow-y-auto border-l-2 border-accent bg-accent-soft px-3.5 py-3 text-accent-ink lg:h-auto lg:min-h-24 lg:overflow-visible">
          {/* 1.7 · keep-all 은 도면 6B 값이다. lg 는 5A 그대로 둔다 —
              줄간격을 넓히면 데스크탑 상자가 6px 늘어난다 (실측 169 → 175) */}
          {item.summary ? (
            <p className="text-sm leading-[1.7] break-keep text-pretty lg:leading-relaxed lg:break-normal">
              {item.summary}
            </p>
          ) : null}
          {item.relevance ? (
            /* 왜 중요한가엔 한 겹 더 힘을 준다 — 요약은 사실이고 이건 판단이다 */
            <p className="text-sm leading-[1.7] font-medium break-keep text-pretty lg:leading-relaxed lg:break-normal">
              {item.relevance}
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        캡션 한 줄 (도면 6B: "샘플 매체 A · 3시간 전 · 원제 [샘플] …", 11px).
        5A 는 이 셋을 맨 윗줄과 제목 밑으로 나눠 놓는데, 6B 는 요약 아래 한 줄로
        모은다 — 제목·이미지·요약이 위를 차지하고 출처는 각주가 되는 배치다.
      */}
      <span className="shrink-0 text-[11px] leading-[1.5] text-dim break-keep lg:hidden">
        {item.source} · {formatRelative(item.publishedAt)}
        {item.headline ? ` · 원제 ${item.title}` : ""}
        {alsoIn}
      </span>
      </div>

      {/*
        버튼 줄 (도면 6B: 위 구분선 · padding-top 12px · gap 8px · 원문이 flex:1).
        mt-auto — 카드 높이가 제각각이어도 버튼 줄은 바닥에 나란히 선다.

        ⚠ 담아두기·검색은 도면에서 opacity:0.45 로 흐리다. 아직 붙지 않은
          기능이라는 뜻이고, PendingButton 이 `disabled` + `disabled:opacity-45`
          (ui.tsx)로 이미 같은 값을 낸다 — 흐릴 뿐 아니라 실제로 안 눌린다.
          도면보다 한 걸음 더 간 셈이라 그대로 둔다.
      */}
      <div className="mt-auto flex shrink-0 gap-2 border-t border-line pt-3 lg:flex-wrap lg:border-t-0 lg:pt-1">
        <LinkButton
          href={item.url}
          external
          variant="primary"
          className="flex-1 lg:flex-none"
        >
          <ExternalLink size={16} strokeWidth={1.5} />
          원문
        </LinkButton>
        <PendingButton title="담아두기" className="w-11 shrink-0 px-0">
          <Bookmark size={16} strokeWidth={1.5} />
        </PendingButton>
        <PendingButton title="Claude 로 조사" className="w-11 shrink-0 px-0">
          <Search size={16} strokeWidth={1.5} />
        </PendingButton>
      </div>
      </div>

      {/*
        데스크탑 이미지 단 (도면 7A · 7B). 카드 높이만큼 세로로 늘어난다 —
        기본 align-items:stretch 가 그렇게 해 주고, 그래서 글이 길든 짧든
        두 단의 밑변이 나란히 선다.

        lg:w-1/2 — 도면 실측이 글 346px : 이미지 343px 이라 사실상 반반이다.
        고정 px 대신 비율로 두면 1152px 을 넘는 창에서도 같은 균형이 유지된다.
      */}
      <NewsImage item={item} className="hidden lg:flex lg:w-1/2 lg:shrink-0" />
    </article>
  );
}

/**
 * 2·3층 행 끝의 아이콘 버튼 하나. 담아두기와 원문이 **같은 상자**를 쓴다 —
 * 둘이 나란히 서는데 크기나 모서리가 다르면 그게 먼저 눈에 띈다.
 *
 * ⚠ **테두리 색은 여기 없다.** 둘이 다른 색을 쓰기 때문이다(도면 10A: 담아두기는
 *   회색, 원문은 강조색). border-line 을 여기 넣고 쓰는 쪽에서 border-accent 로
 *   덮으려 하면 Tailwind 는 클래스를 적은 순서가 아니라 **생성된 CSS 순서**로
 *   이기고 지는 걸 정한다 — 어느 쪽이 이길지 매번 확인하게 된다. 색은 각자 준다.
 */
const ROW_ACTION =
  "flex size-10 shrink-0 items-center justify-center rounded-[10px] border";

/**
 * 2층 — 한 줄짜리 행.
 *
 * 도면 5A 에서 표(table)가 사라지고 행 끝에 **바로가기 버튼**이 붙었다.
 * 줄 전체를 링크로 감싸지 않는 이유가 여기 있다: 감싸면 제목을 긁어 복사할
 * 수도, 길게 눌러 메뉴를 열 수도 없다. 여는 건 버튼 하나가 맡는다.
 *
 * 요약이 없는 기사가 대부분인 층이다(요약은 1층에만 붙는다) —
 * 그래서 여기 제목은 summary 가 아니라 원제인 경우가 정상이다.
 */
function SkimList({ items }: { items: NewsItem[] }) {
  return (
    <ul className="flex flex-col border-t border-line">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex min-h-11 flex-col gap-1 border-b border-line py-3 sm:flex-row sm:items-center sm:gap-4"
        >
          {/* ⚠ summary 가 아니라 headline 이다. 요약은 두세 문장이라 한 줄
              목록에 넣으면 줄이 통째로 문단이 된다. 표제가 없으면(요약 전이면)
              원제로 물러난다. */}
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <Score value={item.score} />
            <span className="min-w-0 flex-1 text-sm leading-snug break-keep">
              {item.headline ?? item.title}
            </span>
          </span>
          <span className="flex items-center gap-3 text-xs text-dim">
            <span className="shrink-0">{item.source}</span>
            <span className="shrink-0">{formatRelative(item.publishedAt)}</span>
            {item.topic ? <Tag tone="accent">{item.topic}</Tag> : null}
            {/*
              도면 10A 는 행 끝에 **담아두기 · 원문 두 개**를 32px 로 그렸다.
              40px 로 키운 건 CLAUDE.md 가 조밀한 컨트롤도 40px 밑으로 내리지
              말라고 못박아 뒀고, 이건 폰에서 누르는 것이어서다.

              둘의 색이 다른 것도 도면대로다 — 원문만 강조색이고 담아두기는
              회색이다. 이 줄에서 실제로 할 수 있는 일이 하나뿐이라 그게 눈에
              띄어야 한다.

              ⚠ 담아두기는 **아직 아무 일도 하지 않는다.** disabled 로 두는
                이유가 그거다 — 눌렀는데 반응이 없는 버튼이 제일 나쁘다.
                흐린 정도(45%)는 1층 버튼 줄의 PendingButton 과 같은 값이라
                세 층에서 "준비 중" 이 같은 얼굴을 한다.
            */}
            <button
              type="button"
              disabled
              title="담아두기 — 다음 단계에서 연결됩니다"
              className={`${ROW_ACTION} cursor-not-allowed border-line text-mid opacity-45`}
            >
              <Bookmark size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              title={`${item.headline ?? item.title} 원문 열기`}
              className={`${ROW_ACTION} border-accent text-accent hover:bg-accent/10 active:bg-accent/20`}
            >
              <ExternalLink size={16} strokeWidth={1.5} aria-hidden="true" />
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 3층 — 접을 수 있지만 열어 둔다.
 *
 * 예전엔 접힌 채로 시작했다. 그땐 이 층이 앞 층들 밑에 딸린 꼬리였고, 접어두면
 * 스크롤이 그만큼 짧아지는 이득이 있었다. 지금은 한 층이 화면을 통째로 쓴다 —
 * 접어두면 "펼치기" 한 줄만 놓인 빈 화면 한 장을 넘겨야 한다(도면 5A 도
 * 펼친 상태로 그려져 있다). 접는 것 자체는 남긴다. 건수가 많은 날이 있다.
 */
function ReferenceFold({
  tier,
}: {
  tier: { no: string; label: string; items: NewsItem[] };
}) {
  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-1">
        <h3 className="font-display text-sm uppercase tracking-[0.1em] text-dim">
          {tier.no} · {tier.label}{" "}
          <span className="text-dim">{tier.items.length}건</span>
        </h3>
        <span className="h-px flex-1 bg-line" />
        <span className="flex items-center gap-1 text-[13px] text-accent">
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className="transition-transform group-open:rotate-180"
          />
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <div className="mt-3">
        <SkimList items={tier.items} />
      </div>
    </details>
  );
}
