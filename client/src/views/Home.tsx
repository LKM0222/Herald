import { useEffect, useRef, useState, type RefObject } from "react";
import { formatKoreanDate, formatRelative } from "@shared/date";
import type { Briefing, NewsItem } from "@shared/types";
import { Bookmark, ExternalLink, Search, Zap } from "lucide-react";
import { Launchpad } from "../components/Launchpad";
import { Kicker, LinkButton, PendingButton, SCROLL_PANE } from "../components/ui";
import {
  eventLabel,
  eventsByDate,
  groupByDate,
  monthGrid,
  monthOf,
  WEEKDAYS,
  type DayEvent,
  type MonthCell,
} from "../lib/calendar";
import type { Config } from "../lib/config";
import { troubles, useCalendarFeed, type Feed } from "../lib/feed";
import { hrefFor } from "../lib/views";

/**
 * 하루를 여는 화면.
 *
 * 홈에는 "먼저 볼 것"만 둔다. 나머지 층까지 얹으면 아침에 스크롤이 시작되고,
 * 그 순간 홈이 뉴스 탭의 축소판이 된다.
 * 여러 건은 세로로 쌓지 않고 좌우로 넘긴다 — 한 번에 한 건만 보이면
 * "다음 것도 봐야 하나"를 매번 안 따져도 된다.
 */
export function Home({
  briefing,
  date,
  config,
}: {
  briefing: Briefing;
  /** 오늘이면 생략한다 — 링크에 불필요한 ?d= 를 붙이지 않기 위해 */
  date?: string;
  /** 미니 달력은 브리핑과 별개로 캘린더를 직접 받아온다 */
  config: Config;
}) {
  const leads = briefing.news.filter((item) => item.priority === 1);

  /*
    캘린더는 여기서 한 번만 받아온다. 미니 달력과 "오늘 일정" 숫자가 각자
    받아오면 한쪽만 실데이터인 상태가 조용히 생긴다 — 나란히 붙어 있는 둘이
    서로 다른 값을 말하는 게 이 화면에서 제일 나쁜 실패다.
  */
  const { year, month } = monthOf(briefing.date);
  const cells = monthGrid(year, month);
  const feed = useCalendarFeed(
    config,
    cells[0].date,
    cells[cells.length - 1].date,
  );
  const events =
    feed.state === "live" ? groupByDate(feed.events) : eventsByDate(briefing);

  return (
    // lg:min-h-0 — 아래 두 칸(본문·스트립)이 AppShell 의 <main> 높이에 그대로
    // 눌러앉게 한다. 없으면 이 줄이 내용 높이만큼 늘어나 버려 두 칸 다 넘칠 일이
    // 없어지고, SCROLL_PANE 의 overflow-y-auto 가 죽은 코드가 된다.
    <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-row lg:gap-10">
      <div
        data-scrollarea
        className={`flex min-w-0 flex-1 flex-col gap-6 ${SCROLL_PANE}`}
      >
        <div className="flex flex-col gap-1.5">
          <Kicker>오늘의 Herald</Kicker>
          <h2 className="max-w-[32ch] font-display text-2xl leading-tight sm:text-[27px]">
            {briefing.headline}
          </h2>
        </div>

        <LeadCarousel leads={leads} total={briefing.news.length} date={date} />

        <ContinueSection briefing={briefing} />
      </div>

      {/*
        우측 스트립 — 모바일에선 본문 아래로 내려온다. lg 부터는 SCROLL_PANE 으로
        본문과 따로 스크롤한다(도면: 본문을 굴려도 스트립은 안 따라간다).
      */}
      <aside
        data-scrollarea
        className={`flex shrink-0 flex-col gap-7 border-line lg:w-56 lg:border-l lg:pl-6 ${SCROLL_PANE}`}
      >
        <Stats briefing={briefing} today={events.get(briefing.date)?.length ?? 0} />
        <MiniCalendar
          briefing={briefing}
          date={date}
          cells={cells}
          events={events}
          feed={feed}
        />
        {/*
          런치패드는 도면(3A)에서 좌측 내비 아래로 내려갔다. 그 내비가 PC 전용이라
          모바일에선 갈 곳이 없어져, 좁을 때만 여기에 남긴다.
        */}
        <div className="md:hidden">
          <Launchpad
            items={briefing.launchpad}
            listClassName="grid grid-cols-2 gap-1.5"
          />
        </div>
      </aside>
    </div>
  );
}

/** 드래그로 볼 최소 이동량(px). 이보다 덜 움직였으면 클릭이다. */
const DRAG_SLOP = 6;

/**
 * 스크롤 위치에 가장 가까운 카드.
 *
 * 카드 폭은 트랙 폭과 다르다(좌우 여백·간격). 나눗셈으로 넘겨짚지 않는다.
 * ⚠ offsetLeft 는 "가장 가까운 위치 지정 조상" 기준이라, 이 비교가 성립하려면
 *   트랙이 offsetParent 여야 한다 — 그래서 트랙에 relative 가 붙어 있다.
 */
function nearestIndex(track: HTMLElement): number {
  const cards = [...track.children] as HTMLElement[];
  let nearest = 0;
  let best = Infinity;
  cards.forEach((card, index) => {
    const distance = Math.abs(card.offsetLeft - track.scrollLeft);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  return nearest;
}

/** 카드 위치를 그대로 목적지로 쓴다 — 폭을 가정하면 snap 이 끄는 자리와 어긋난다. */
function scrollToCard(track: HTMLElement, index: number) {
  const card = track.children[index] as HTMLElement | undefined;
  // scrollIntoView 를 쓰지 않는 이유: 세로 스크롤까지 건드린다.
  if (card) track.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
}

/**
 * 마우스로 붙잡고 끌어서 넘기기.
 *
 * `overflow-x: auto` 는 터치·휠·트랙패드로만 움직인다. 마우스로 끄는 동작은
 * 어느 브라우저에도 없어서 직접 만들어야 한다.
 *
 * 터치는 일부러 건드리지 않는다 — 가로채는 순간 관성 스크롤을 잃는다.
 * 그래서 pointerType 이 mouse 일 때만 개입한다.
 */
function useDragScroll(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const track = ref.current;
    if (!track) return;

    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = 0;
    let suppressClick = false;
    let restoreTimer = 0;

    /**
     * ⚠ 복구 예약은 한 번에 하나만 살아 있어야 한다.
     *
     * 남겨두면 다음 드래그 도중에 터진다. 그 순간 snap 이 되살아나
     * scrollLeft 를 쓸 때마다 스냅 지점으로 되끌려 드래그가 죽는다.
     * 그리고 죽은 채로는 정렬 스크롤도 안 나니 scrollend 가 또 안 와서
     * 예약이 다시 남는다 — 한 번 빠지면 못 나오는 고리다.
     */
    const cancelRestore = () => {
      window.clearTimeout(restoreTimer);
      restoreTimer = 0;
      track.removeEventListener("scrollend", finishRestore);
    };

    // 화살표 함수여야 위의 `if (!track) return` 이 좁혀둔 타입이 살아남는다.
    const finishRestore = () => {
      cancelRestore();
      track.style.scrollSnapType = "";
    };

    /**
     * 정렬 스크롤이 끝나면 snap 을 되돌린다.
     *
     * 도는 도중에 되돌리면 mandatory 스냅이 즉시 잡아채 이동이 툭 끊긴다.
     * 이미 제자리라 스크롤이 아예 안 일어나는 경우(마지막 카드 너머로 민 뒤가
     * 그렇다)엔 scrollend 가 오지 않으므로 타이머를 함께 건다.
     */
    const scheduleRestore = () => {
      cancelRestore();
      track.addEventListener("scrollend", finishRestore);
      restoreTimer = window.setTimeout(finishRestore, 500);
    };

    /** 끌고 놓은 손끝이 버튼 위였다고 그 버튼이 눌리면 안 된다. */
    const swallowClick = (event: MouseEvent) => {
      // detail 0 은 키보드로 누른 click 이다 — 드래그의 잔상이 아니니 통과시킨다.
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      cancelRestore();
      dragging = true;
      moved = 0;
      suppressClick = false;
      startX = event.clientX;
      startScroll = track.scrollLeft;
      // snap 을 켜 둔 채 scrollLeft 를 만지면 브라우저가 매 프레임 스냅 지점으로
      // 되끌어당겨 드래그가 통째로 씹힌다.
      track.style.scrollSnapType = "none";
      track.style.cursor = "grabbing";
      // 텍스트가 잡히거나 링크가 통째로 끌려가는(네이티브 drag) 걸 막는다.
      event.preventDefault();
    };

    // 창 전체에서 듣는다. 트랙 밖으로 손이 나가도 드래그가 이어져야 하고,
    // setPointerCapture 를 쓰면 뒤따르는 click 까지 트랙으로 재조준돼
    // 카드 안 링크가 눌리지 않는다.
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      // 창 밖에서 손을 떼면 pointerup 이 오지 않는다. 그대로 두면 버튼을 뗀
      // 뒤에도 카드가 마우스를 따라다닌다.
      if (event.buttons === 0) {
        onPointerUp();
        return;
      }
      const delta = event.clientX - startX;
      moved = Math.max(moved, Math.abs(delta));
      track.scrollLeft = startScroll - delta;
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      track.style.cursor = "";

      // 리스너를 달았다 떼는 대신 깃발만 세운다 — 뗄 시점을 타이머로 재면
      // 그 타이머가 또 남는다.
      suppressClick = moved > DRAG_SLOP;

      // 손을 뗀 자리는 카드 경계가 아니다. 가까운 카드로 정렬한 뒤 snap 을 되돌린다.
      scrollToCard(track, nearestIndex(track));
      scheduleRestore();
    };

    track.addEventListener("click", swallowClick, { capture: true });
    track.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      track.removeEventListener("click", swallowClick, true);
      cancelRestore();
      track.style.scrollSnapType = "";
      track.style.cursor = "";
    };
  }, [ref]);
}

/**
 * 좌우로 넘기는 리드 카드.
 *
 * 자바스크립트 캐러셀을 만들지 않고 `scroll-snap` 에 맡긴다 —
 * 터치 관성·접근성·키보드 조작이 브라우저 기본 동작으로 따라온다.
 * 마우스 드래그만 브라우저가 안 해주는 부분이라 useDragScroll 로 보탠다.
 * 점 표시는 스크롤 위치를 읽어 갱신한다.
 */
function LeadCarousel({
  leads,
  total,
  date,
}: {
  leads: NewsItem[];
  total: number;
  date?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => setActive(nearestIndex(track));
    track.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => track.removeEventListener("scroll", onScroll);
  }, [leads.length]);

  useDragScroll(trackRef);

  function goTo(index: number) {
    const track = trackRef.current;
    if (track) scrollToCard(track, index);
  }

  if (leads.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-dim">
        먼저 볼 것으로 분류된 기사가 없어요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div
        ref={trackRef}
        className={`relative -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          // 넘길 게 없으면 잡히는 척하지 않는다
          leads.length > 1 ? "cursor-grab" : ""
        }`}
      >
        {leads.map((item, index) => (
          <LeadCard
            key={item.id}
            item={item}
            index={index + 1}
            total={leads.length}
          />
        ))}
      </div>

      {leads.length > 1 ? (
        <div className="flex justify-center gap-2">
          {leads.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${index + 1}번째 기사`}
              aria-current={index === active}
              className={`h-1.5 rounded-full transition-all ${
                index === active ? "w-6 bg-accent" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
      ) : null}

      <a
        href={hrefFor("news", date)}
        className="self-start text-[13px] text-accent hover:underline"
      >
        자세한 건 뉴스 탭에서 · 전체 {total}건 →
      </a>
    </div>
  );
}

/**
 * 리드 카드 한 장.
 *
 * "왜 중요한가"를 따로 박스에 가두지 않고 원제·다른 매체와 묶어 한 문단으로
 * 읽힌다 — 홈에서 한 건만 보여주는 이상, 조각내면 오히려 눈이 흩어진다.
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
  return (
    <article className="flex w-full shrink-0 snap-start flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <Kicker tone="accent">
          먼저 볼 것 · {String(index).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </Kicker>
        <span className="hidden h-px flex-1 bg-line sm:block" />
        <span className="text-[11px] text-dim">
          {item.source} · {formatRelative(item.publishedAt)}
          {item.topic ? ` · ${item.topic}` : ""}
        </span>
      </div>

      <h3 className="max-w-[24ch] font-display text-2xl leading-[1.18] sm:text-[31px]">
        {item.summary ?? item.title}
      </h3>

      <p className="max-w-[56ch] text-[15px] leading-relaxed text-mid text-pretty">
        {describeItem(item)}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={item.url} external variant="primary">
          <ExternalLink size={16} strokeWidth={1.5} />
          <span className="whitespace-nowrap">원문 열어보기</span>
        </LinkButton>
        <PendingButton title="담아두기">
          <Bookmark size={16} strokeWidth={1.5} />
          <span className="whitespace-nowrap">담아두기</span>
        </PendingButton>
        <PendingButton title="Claude 로 조사">
          <Search size={16} strokeWidth={1.5} />
          <span className="whitespace-nowrap">Claude 로 조사</span>
        </PendingButton>
      </div>
    </article>
  );
}

/** 관련성 · 중복 보도 · 원제를 한 문단으로 잇는다. 없는 조각은 빠진다. */
function describeItem(item: NewsItem): string {
  const parts: string[] = [];
  if (item.relevance) parts.push(item.relevance);

  const extra = item.alsoIn?.length ?? 0;
  if (extra > 0) parts.push(`같은 사건을 다른 매체 ${extra}곳도 다뤘어요`);

  if (item.summary) parts.push(`원제는 ${item.title} 예요`);

  return parts.length > 0 ? `${parts.join(". ")}.` : item.title;
}

function ContinueSection({ briefing }: { briefing: Briefing }) {
  if (briefing.continues.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-display text-[13px] uppercase tracking-[0.1em] text-dim">
        어제 이어서
      </h3>
      {briefing.continues.map((item) => (
        <div
          key={item.project}
          className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-5 py-4"
        >
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-lg">{item.project}</span>
            <span className="text-[11px] text-dim">
              어제는 {item.yesterday}
            </span>
          </div>
          <p className="text-[15px]">{item.next}</p>
          <div className="mt-1">
            <PendingButton title="세션 열고 이어가기">
              <Zap size={16} strokeWidth={1.5} />
              세션 열고 이어가기
            </PendingButton>
          </div>
        </div>
      ))}
    </section>
  );
}

function Stats({ briefing, today }: { briefing: Briefing; today: number }) {
  const rows = [
    { label: "모인 기사", value: briefing.news.length, accent: false },
    {
      label: "먼저 볼 것",
      value: briefing.news.filter((item) => item.priority === 1).length,
      accent: true,
    },
    { label: "오늘 일정", value: today, accent: false },
  ];

  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>지금 상황</Kicker>
      <div className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between border-b border-line py-2"
          >
            <span className="text-xs text-mid">{row.label}</span>
            <span
              className={`font-display text-xl ${row.accent ? "text-accent" : ""}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 오른쪽 스트립의 미니 월간 달력 (도면 3A).
 *
 * 오늘 일정 목록을 대신한다 — 목록만 있으면 "오늘"밖에 못 보지만, 달력이면
 * 이번 달 어디가 비었는지가 한눈에 들어온다.
 * 날짜를 누르면 아래 목록이 그날로 바뀌고, 일정을 누르면 일정 탭의 그 날로 간다.
 *
 * 브리핑이 아니라 캘린더에서 직접 받아온다. 일정 탭과 다른 데이터를 보면
 * 같은 날을 두 화면에서 다르게 읽게 된다.
 *
 * 손가락 기준 40px 은 좁은 화면에서 확보된다 — 그때는 스트립이 화면 전폭이라
 * 한 칸이 41px 안팎이 된다. PC 스트립(224px)에서는 마우스가 쓴다.
 */
function MiniCalendar({
  briefing,
  date,
  cells,
  events,
  feed,
}: {
  briefing: Briefing;
  date?: string;
  /** 42칸 전체. 그리는 건 이 중 앞부분뿐이다 */
  cells: MonthCell[];
  events: Map<string, DayEvent[]>;
  feed: Feed;
}) {
  const [selected, setSelected] = useState(briefing.date);
  const month = Number(briefing.date.slice(5, 7));

  // 이번 달이 끝난 뒤의 빈 줄은 자른다. 미니 달력에서 한 줄은 꽤 큰 자리다.
  const lastReal = cells.reduce(
    (last, cell, index) => (cell.inMonth ? index : last),
    0,
  );
  const visible = cells.slice(0, Math.ceil((lastReal + 1) / 7) * 7);

  const picked = events.get(selected) ?? [];
  const trouble = troubles(feed)[0];

  /** 오늘을 보고 있으면 ?d= 를 붙이지 않는다. */
  const linkFor = (day: string) =>
    hrefFor("schedule", day === briefing.date ? date : day);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Kicker>{month}월</Kicker>
        <a
          href={hrefFor("schedule", date)}
          className="text-[11px] text-accent hover:underline"
        >
          일정 탭 →
        </a>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-0.5 text-[9px] text-dim">
            {day}
          </span>
        ))}
        {visible.map((cell) =>
          cell.inMonth ? (
            <button
              key={cell.date}
              type="button"
              onClick={() => setSelected(cell.date)}
              aria-pressed={cell.date === selected}
              className={`flex min-h-10 items-center justify-center rounded-md font-display text-xs tabular-nums ${
                cell.date === selected
                  ? "bg-accent text-bg"
                  : events.has(cell.date)
                    ? "text-accent hover:bg-fg/[0.07]"
                    : "hover:bg-fg/[0.07]"
              }`}
            >
              {cell.day}
            </button>
          ) : (
            <span key={cell.date} />
          ),
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line pt-2">
        <span className="text-[11px] text-dim">
          {formatKoreanDate(selected)}
        </span>

        {picked.length === 0 ? (
          <span className="text-xs text-mid">
            {feed.state === "loading" ? "불러오는 중이에요" : "이 날은 비어 있어요"}
          </span>
        ) : (
          picked.map((item) => (
            /*
              일정 자체가 링크다. 여기엔 상세를 펼칠 자리가 없어서, 누르면
              일정 탭의 그 날로 보낸다 — 눌러도 아무 일이 없는 것보다는
              갈 데가 있는 편이 낫다.
            */
            <a
              key={item.id}
              href={linkFor(item.date ?? selected)}
              /*
                가로 여백을 음수 마진으로 빼지 않는다 — 스트립 폭보다 넓어져서
                aside 까지 넘침이 전파된다(좁은 화면에서 6px 씩 밀린다).
              */
              className="flex gap-2.5 rounded-md py-1 text-xs hover:bg-fg/[0.07] active:bg-fg/[0.14]"
            >
              <span className="shrink-0 font-display tabular-nums text-accent">
                {eventLabel(item)}
              </span>
              <span className="min-w-0 break-keep">{item.title}</span>
            </a>
          ))
        )}

        {/* 못 가져온 게 있으면 조용히 넘어가지 않는다 — 빈 날로 보이기 때문이다 */}
        {trouble ? (
          <span className="text-[11px] leading-relaxed break-keep text-mid">
            ⚠ {trouble.label} · {trouble.message}
          </span>
        ) : null}
      </div>
    </section>
  );
}

