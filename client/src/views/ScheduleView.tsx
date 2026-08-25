import { useEffect, useState, type ReactNode } from "react";
import { formatKoreanDate, shiftISO } from "@shared/date";
import type { Briefing, CalendarEvent } from "@shared/types";
import {
  CalendarCheck,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import {
  describeFailure,
  fetchCalendarEvents,
  type CalendarEventsResult,
  type CalendarFailure,
} from "../lib/api";
import type { Config } from "../lib/config";
import { Kicker, SCROLL_PANE, Tag } from "../components/ui";
import {
  eventLabel,
  eventsByDate,
  groupByDate,
  eventTime,
  monthGrid,
  monthOf,
  shiftMonthKeepingDay,
  weekRow,
  weekStart,
  WEEKDAYS,
  type DayEvent,
  type MonthCell,
} from "../lib/calendar";
import { hrefFor } from "../lib/views";

/**
 * 일정 탭 — 월간 캘린더가 기본이다.
 *
 * 시간표를 걷어냈다. 하루 두세 건인 달력에서 9시부터 17시까지 빈 줄을 그려두면
 * 화면 대부분이 아무것도 아닌 것으로 채워진다.
 *
 * ⚠ 캘린더 연동 전이라 채워지는 건 오늘과 다음 7일뿐이다. 나머지 날이 비어
 *   보이는 건 일정이 없어서가 아니라 아직 모르는 것이라, 그 사실을 화면에
 *   적어둔다 — 안 적으면 "연동됐는데 한가한 달"로 읽힌다.
 */

/** 일 · 주 · 월. 화살표가 한 번에 옮기는 단위이기도 하다. */
type Range = "day" | "week" | "month";

const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "일" },
  { id: "week", label: "주" },
  { id: "month", label: "월" },
];

/**
 * 캘린더에서 실제로 읽어온 일정.
 *
 * "아직 안 붙였다(off)" 와 "붙였는데 비었다(live · 0건)" 와 "가져오다 실패했다"
 * 를 갈라 둔다. 셋 다 화면에는 빈 달력으로 보이지만 사용자가 할 일이 전부
 * 다르다 — 하나로 뭉뚱그리면 주소가 틀린 걸 한가한 달로 읽는다.
 */
type Feed =
  | { state: "loading" }
  | { state: "off" }
  | { state: "live"; calendars: string[]; events: CalendarEvent[]; failed: CalendarFailure[] }
  | { state: "error"; message: string };

function useCalendarFeed(config: Config, from: string, to: string): Feed {
  const [feed, setFeed] = useState<Feed>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    setFeed({ state: "loading" });
    void fetchCalendarEvents(config, from, to).then((result) => {
      if (!cancelled) setFeed(toFeed(result));
    });
    return () => {
      cancelled = true;
    };
  }, [config, from, to]);

  return feed;
}

function toFeed(result: CalendarEventsResult): Feed {
  if (result.kind !== "ok") {
    return { state: "error", message: describeFailure(result) };
  }
  if (!result.configured) return { state: "off" };
  return {
    state: "live",
    calendars: result.calendars,
    events: result.events,
    failed: result.failed,
  };
}

export function ScheduleView({
  briefing,
  today,
  config,
}: {
  briefing: Briefing;
  today: string;
  config: Config;
}) {
  /**
   * 상태는 "고른 날" 하나뿐이다.
   *
   * 보이는 달도, 보이는 주도, 상세에 뜨는 날도 전부 여기서 나온다.
   * 달과 선택을 따로 들고 있으면 둘이 어긋나는 순간(다른 달 날짜를 눌렀을 때)을
   * 손으로 맞춰줘야 한다.
   */
  const [anchor, setAnchor] = useState(briefing.date);
  const [range, setRange] = useState<Range>("month");

  const { year, month } = monthOf(anchor);
  const grid = monthGrid(year, month);
  const cells = range === "week" ? weekRow(anchor) : grid;

  /**
   * 두 번 받아온다.
   *
   * 하나는 지금 보고 있는 달(주·일 보기의 날짜도 이 격자 안에 있다).
   * 다른 하나는 이번 주와 다음 7일 — 이건 달을 넘겨도 늘 오늘 기준이라
   * 보이는 달과 같이 움직이면 안 된다.
   */
  const feed = useCalendarFeed(config, grid[0].date, grid[grid.length - 1].date);
  const soon = useCalendarFeed(config, weekStart(today), shiftISO(today, 7));

  const live = feed.state === "live";
  const events = live ? groupByDate(feed.events) : eventsByDate(briefing);
  const picked = events.get(anchor) ?? [];

  const upcoming =
    soon.state === "live"
      ? soon.events.filter((item) => item.date > today)
      : briefing.upcoming;

  return (
    // lg:min-h-0 — Home.tsx 와 같은 이유. 본문·스트립을 AppShell <main> 의
    // 실제 높이에 맞춰 눌러앉혀야 SCROLL_PANE 의 overflow-y-auto 가 의미를 갖는다.
    <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-row lg:gap-10">
      <div
        data-scrollarea
        className={`flex min-w-0 flex-1 flex-col gap-6 ${SCROLL_PANE}`}
      >
        {/*
          좁은 화면에선 조작부를 제목 아래로 내린다. 한 줄에 같이 두면 제목이
          네 줄로 눌린다 — 320px 에서 버튼 셋이 130px 을 가져간다.
        */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Kicker>{rangeLabel(range, anchor)}</Kicker>
            {/* break-keep — 안 주면 좁은 화면에서 "몰 / 려 있죠" 처럼 낱말이 쪼개진다 */}
            <h2 className="max-w-[32ch] break-keep font-display text-2xl leading-tight sm:text-[27px]">
              {feed.state === "loading"
                ? "일정을 가져오는 중이에요."
                : headline(range, anchor, today, cells, events)}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* 멀리 갔을 때만 돌아올 길을 낸다. 오늘이면 눌러도 달라질 게 없다 */}
            {anchor !== today ? (
              <button
                type="button"
                onClick={() => setAnchor(today)}
                className="min-h-10 rounded-full border border-line px-3 text-[13px] hover:bg-fg/[0.07] active:bg-fg/[0.14]"
              >
                오늘
              </button>
            ) : null}
            {/*
              직전 값을 함수로 받는다. anchor 를 그대로 읽으면 빠르게 두 번 누를 때
              두 번 다 같은 자리에서 계산해 한 번이 사라진다.
            */}
            <Step label={`이전 ${unitName(range)}`} onClick={() => step(-1)}>
              <ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />
            </Step>
            <Step label={`다음 ${unitName(range)}`} onClick={() => step(1)}>
              <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
            </Step>
          </div>
        </div>

        <FeedTrouble feed={feed} />

        {/* 일 보기에선 달력이 곧 아래 상세라 격자를 그리지 않는다 */}
        {range === "day" ? null : (
          <Grid
            cells={cells}
            events={events}
            today={today}
            anchor={anchor}
            onPick={setAnchor}
          />
        )}

        <DaySheet date={anchor} events={picked} today={today} />

        <section className="flex flex-col gap-2.5">
          <h3 className="font-display text-sm uppercase tracking-[0.1em] text-dim">
            다음 7일
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-dim">앞으로 잡힌 일정이 없어요.</p>
          ) : (
            <ul className="flex flex-col">
              {upcoming.map((item) => (
                <li key={item.id} className="border-t border-line">
                  {/* 목록에서도 날짜로 건너뛸 수 있어야 달력과 따로 놀지 않는다 */}
                  <button
                    type="button"
                    onClick={() => setAnchor(item.date)}
                    className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2.5 text-left hover:bg-fg/[0.05]"
                  >
                    <span className="w-24 shrink-0 text-[13px] text-dim">
                      {formatKoreanDate(item.date)}
                    </span>
                    <span className="w-12 shrink-0 font-display text-sm tabular-nums">
                      {eventLabel(item)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* lg 부터 본문과 따로 스크롤한다(도면: 스트립을 굴려도 본문은 안 따라간다) */}
      <aside
        data-scrollarea
        className={`flex shrink-0 flex-col gap-7 border-line lg:w-56 lg:border-l lg:pl-6 ${SCROLL_PANE}`}
      >
        <WeekStats briefing={briefing} today={today} soon={soon} />
        <ConnectedCalendars feed={feed} />
        <RangePicker value={range} onChange={setRange} />
      </aside>
    </div>
  );

  /** 화살표는 지금 보고 있는 단위만큼 움직인다. */
  function step(delta: number) {
    setAnchor((at) =>
      range === "month"
        ? shiftMonthKeepingDay(at, delta)
        : shiftISO(at, delta * (range === "week" ? 7 : 1)),
    );
  }
}

/**
 * 가져오다 잘못된 것을 화면에 드러낸다.
 *
 * 캘린더 하나가 죽어도 나머지는 그려지기 때문에, 말해주지 않으면
 * 그 캘린더의 일정이 통째로 사라진 걸 알아챌 방법이 없다.
 */
function FeedTrouble({ feed }: { feed: Feed }) {
  const rows =
    feed.state === "error"
      ? [{ label: "캘린더", message: feed.message }]
      : feed.state === "live"
        ? feed.failed.map((item) => ({
            label: item.label,
            message: item.message,
          }))
        : [];

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-fg/[0.04] px-4 py-3">
      {rows.map((row) => (
        <p
          key={row.label + row.message}
          className="flex items-start gap-2 text-[13px] leading-relaxed break-keep text-mid"
        >
          <TriangleAlert
            size={15}
            strokeWidth={1.5}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            <b className="font-medium">{row.label}</b> · {row.message}
          </span>
        </p>
      ))}
    </div>
  );
}

/** 도면은 34px 원이지만 손가락이 닿는 곳이라 40px 로 올렸다. */
function Step({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full border border-line hover:bg-fg/[0.07] active:bg-fg/[0.14]"
    >
      {children}
    </button>
  );
}

function Grid({
  cells,
  events,
  today,
  anchor,
  onPick,
}: {
  cells: MonthCell[];
  events: Map<string, DayEvent[]>;
  today: string;
  anchor: string;
  onPick: (date: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((day, index) => (
          <span
            key={day}
            className={`text-center text-[11px] tracking-[0.06em] ${
              index >= 5 ? "text-mid" : "text-dim"
            }`}
          >
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell) => (
          <DayCell
            key={cell.date}
            cell={cell}
            events={events.get(cell.date) ?? []}
            isToday={cell.date === today}
            isPicked={cell.date === anchor}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 하루 칸.
 *
 * 320px 에서 한 칸은 40px 안쪽이라 "10:00 [샘플] 일정" 이 절대 안 들어간다.
 * 좁을 땐 점으로 개수만 알리고, 넓어지면 도면대로 칩을 편다.
 */
function DayCell({
  cell,
  events,
  isToday,
  isPicked,
  onPick,
}: {
  cell: MonthCell;
  events: DayEvent[];
  isToday: boolean;
  isPicked: boolean;
  onPick: (date: string) => void;
}) {
  // 고른 날은 테두리로, 오늘은 바탕으로 표시한다. 둘이 같은 날이어도 겹치지 않는다.
  const edge = isPicked
    ? "border-accent ring-1 ring-accent"
    : isToday
      ? "border-accent"
      : "border-line";

  return (
    <button
      type="button"
      onClick={() => onPick(cell.date)}
      aria-pressed={isPicked}
      aria-label={`${cell.date.slice(5, 7)}월 ${cell.day}일${
        events.length > 0 ? `, 일정 ${events.length}건` : ", 일정 없음"
      }`}
      className={`flex min-h-14 min-w-0 flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left hover:bg-fg/[0.05] sm:min-h-[84px] sm:rounded-xl sm:p-2 ${edge} ${
        isToday ? "bg-accent-soft" : ""
      } ${cell.inMonth ? "" : "opacity-45"}`}
    >
      <span
        className={`font-display text-sm tabular-nums sm:text-[15px] ${
          isToday || isPicked
            ? "text-accent"
            : cell.weekend
              ? "text-mid"
              : ""
        }`}
      >
        {cell.day}
      </span>

      {/* 좁은 화면 — 점으로 개수만 */}
      <span className="flex gap-0.5 sm:hidden">
        {events.slice(0, 3).map((event) => (
          <span
            key={event.id}
            className={`size-1 rounded-full ${isToday ? "bg-accent" : "bg-dim"}`}
          />
        ))}
      </span>

      {/* 넓은 화면 — 도면대로 칩 */}
      <span className="hidden min-w-0 flex-col gap-1 sm:flex">
        {events.map((event) => (
          <span
            key={event.id}
            className={`truncate rounded-md px-1.5 py-0.5 text-[11px] leading-[1.35] ${
              isToday ? "bg-surface" : "bg-accent-soft text-accent-ink"
            }`}
          >
            {eventLabel(event)} {event.title}
          </span>
        ))}
      </span>
    </button>
  );
}

/** 고른 날 하나. 달력에서 칩으로 잘려 나간 제목이 여기서 온전히 보인다. */
function DaySheet({
  date,
  events,
  today,
}: {
  date: string;
  events: DayEvent[];
  today: string;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h3 className="font-display text-lg">{formatKoreanDate(date)}</h3>
        {date === today ? <Tag tone="accent">오늘</Tag> : null}
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-dim">이 날은 비어 있어요.</p>
      ) : (
        <ul className="flex flex-col">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-line py-2.5 first:border-t-0 first:pt-0"
            >
              <span className="w-24 shrink-0 font-display text-sm tabular-nums text-accent">
                {eventTime(event)}
              </span>
              <span className="min-w-0 flex-1 text-[15px]">{event.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function unitName(range: Range): string {
  return range === "month" ? "달" : range === "week" ? "주" : "날";
}

/** "8월 24일" — 요일 없이 짧게. */
function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

function rangeLabel(range: Range, anchor: string): string {
  if (range === "day") return formatKoreanDate(anchor);
  if (range === "month") {
    const { year, month } = monthOf(anchor);
    return `${year}년 ${month}월`;
  }
  const from = weekStart(anchor);
  const to = shiftISO(from, 6);
  // 주가 달을 걸치면 뒤쪽에도 달을 붙여야 어느 달인지 알 수 있다.
  const tail =
    from.slice(0, 7) === to.slice(0, 7)
      ? `${Number(to.slice(8, 10))}일`
      : shortDate(to);
  return `${shortDate(from)} – ${tail}`;
}

/** 도면의 "이번 달은 네 건이에요. 오늘 두 건이 몰려 있죠." 자리. */
function headline(
  range: Range,
  anchor: string,
  today: string,
  cells: MonthCell[],
  events: Map<string, DayEvent[]>,
): string {
  if (range === "day") {
    const count = events.get(anchor)?.length ?? 0;
    const subject = anchor === today ? "오늘은" : "이 날은";
    return count === 0 ? `${subject} 비어 있어요.` : `${subject} ${count}건이에요.`;
  }

  if (range === "week") {
    const total = countIn(cells, events, false);
    const subject = cells.some((cell) => cell.date === today) ? "이번 주는" : "이 주는";
    return total === 0 ? `${subject} 비어 있어요.` : `${subject} ${total}건이에요.`;
  }

  const total = countIn(cells, events, true);
  if (!anchor.startsWith(today.slice(0, 7))) {
    return total === 0 ? "이 달은 아직 아무것도 없어요." : `이 달은 ${total}건이에요.`;
  }
  if (total === 0) return "이번 달은 아직 비어 있어요.";

  const todayCount = events.get(today)?.length ?? 0;
  return todayCount === 0
    ? `이번 달은 ${total}건이에요. 오늘은 비어 있죠.`
    : `이번 달은 ${total}건이에요. 오늘 ${todayCount}건이 몰려 있죠.`;
}

/** 격자에 실제로 걸린 일정 수. 월간에선 앞뒤로 채운 날을 빼고 센다. */
function countIn(
  cells: MonthCell[],
  events: Map<string, DayEvent[]>,
  onlyInMonth: boolean,
): number {
  return cells
    .filter((cell) => !onlyInMonth || cell.inMonth)
    .reduce((sum, cell) => sum + (events.get(cell.date)?.length ?? 0), 0);
}

/**
 * 이번 주 숫자 셋.
 *
 * ⚠ 여기서 보는 "이번 주" 는 화면에 보이는 주가 아니라 **오늘이 든 주**다.
 *   달을 넘겨 구경하는 중에 이 숫자까지 따라 움직이면 기준이 사라진다.
 */
function WeekStats({
  briefing,
  today,
  soon,
}: {
  briefing: Briefing;
  today: string;
  soon: Feed;
}) {
  const week = weekRow(today);
  const counted = countWeek(week, today, soon, briefing);

  const rows = [
    { label: "오늘", value: counted.today, accent: true },
    { label: "이번 주", value: counted.week, accent: false },
    { label: "비어 있는 날", value: counted.empty, accent: false },
  ];

  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>이번 주</Kicker>
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

/** 이번 주 숫자. 실데이터가 있으면 그걸로, 없으면 브리핑으로 센다. */
function countWeek(
  week: MonthCell[],
  today: string,
  soon: Feed,
  briefing: Briefing,
): { today: number; week: number; empty: number } {
  if (soon.state !== "live") {
    return {
      today: briefing.schedule.length,
      week:
        briefing.week.reduce((sum, day) => sum + day.count, 0) +
        briefing.upcoming.length,
      empty: briefing.week.filter((day) => day.count === 0).length,
    };
  }

  const dates = new Set(week.map((cell) => cell.date));
  const inWeek = soon.events.filter((event) => dates.has(event.date));
  const byDate = groupByDate(inWeek);

  return {
    today: byDate.get(today)?.length ?? 0,
    week: inWeek.length,
    empty: week.filter((cell) => !byDate.has(cell.date)).length,
  };
}

/**
 * 붙어 있는 캘린더.
 *
 * 붙기 전에는 달력에 오늘과 다음 7일만 들어오는데, 그 사실을 적어두지 않으면
 * 비어 있는 달을 "연동됐는데 한가한 달" 로 읽는다.
 */
function ConnectedCalendars({ feed }: { feed: Feed }) {
  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>연결된 캘린더</Kicker>
      <div className="flex flex-col items-start gap-2 rounded-xl border border-line px-4 py-3.5">
        {feed.state === "live" && feed.calendars.length > 0 ? (
          <>
            <span className="flex items-center gap-2 text-sm">
              <CalendarCheck size={16} strokeWidth={1.5} className="text-accent" />
              네이버 캘린더
            </span>
            <ul className="flex flex-col gap-1">
              {feed.calendars.map((name) => (
                <li key={name} className="text-xs break-keep text-dim">
                  · {name}
                </li>
              ))}
            </ul>
            <Tag tone="accent">연결됨</Tag>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 text-sm">
              <CalendarX size={16} strokeWidth={1.5} className="text-dim" />
              네이버 캘린더
            </span>
            <Tag>
              {feed.state === "loading" ? "확인하는 중이에요" : "아직 연결 전이에요"}
            </Tag>
            <p className="text-xs leading-relaxed break-keep text-dim">
              연결 전이라 달력에는 오늘과 다음 7일만 채워져요.
            </p>
          </>
        )}
        <a
          href={`${hrefFor("settings")}#calendar`}
          className="text-[13px] text-accent hover:underline"
        >
          설정에서 {feed.state === "live" ? "관리하기" : "연결하기"} →
        </a>
      </div>
    </section>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>보기</Kicker>
      <div className="flex overflow-hidden rounded-xl border border-line">
        {RANGES.map((range) => {
          const active = range.id === value;
          return (
            <button
              key={range.id}
              type="button"
              onClick={() => onChange(range.id)}
              aria-pressed={active}
              title={`${range.label}간 보기`}
              className={`min-h-10 flex-1 border-l border-line text-sm first:border-l-0 ${
                active
                  ? "bg-accent font-medium text-bg"
                  : "hover:bg-fg/[0.07] active:bg-fg/[0.14]"
              }`}
            >
              {range.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
