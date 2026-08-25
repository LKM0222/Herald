import { useEffect, useState, type ReactNode } from "react";
import { formatKoreanDate, shiftISO } from "@shared/date";
import type {
  Briefing,
  CalendarSubscription,
  UpcomingItem,
} from "@shared/types";
import { fetchSubscriptions, toggleSubscription } from "../lib/api";
import {
  CalendarX,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import type { Config } from "../lib/config";
import { troubles, useCalendarFeed, type Feed } from "../lib/feed";
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

export function ScheduleView({
  briefing,
  date,
  today,
  config,
}: {
  /**
   * 뉴스 브리핑. **없을 수 있다** — 일정은 캘린더에서 따로 오기 때문에
   * 그날 브리핑이 안 돌았다고 달력까지 막으면 안 된다.
   * 캘린더가 안 붙었을 때만 여기 담긴 샘플 일정으로 대신한다.
   */
  briefing: Briefing | null;
  /** 보고 있는 날 (YYYY-MM-DD) */
  date: string;
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
  const [anchor, setAnchor] = useState(date);
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
  /**
   * 스트립에서 캘린더를 껐다 켜면 기간도 config 도 그대로라 훅이 안 돈다.
   * 이 숫자를 올려서 그때만 두 벌 다 다시 받아온다 — 한쪽만 갱신하면
   * 달력과 "이번 주" 숫자가 서로 다른 말을 한다.
   */
  const [reloadKey, setReloadKey] = useState(0);
  const [subscriptions, setSubscriptions] = useState<
    CalendarSubscription[] | null
  >(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSubscriptions(config).then((result) => {
      if (!cancelled && result.kind === "ok") {
        setSubscriptions(result.subscriptions);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const feed = useCalendarFeed(
    config,
    grid[0].date,
    grid[grid.length - 1].date,
    reloadKey,
  );
  const soon = useCalendarFeed(
    config,
    weekStart(today),
    shiftISO(today, 7),
    reloadKey,
  );

  const live = feed.state === "live";
  const events = live
    ? groupByDate(feed.events)
    : briefing
      ? eventsByDate(briefing)
      : new Map<string, DayEvent[]>();
  const picked = events.get(anchor) ?? [];

  const upcoming = oncePerSpan(
    soon.state === "live"
      ? soon.events.filter((item) => item.date > today)
      : (briefing?.upcoming ?? []),
  );

  return (
    // lg:min-h-0 — Home.tsx 와 같은 이유. 본문·스트립을 AppShell <main> 의
    // 실제 높이에 맞춰 눌러앉혀야 SCROLL_PANE 의 overflow-y-auto 가 의미를 갖는다.
    <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-row lg:gap-10">
      <div
        data-scrollarea
        className={`flex min-w-0 flex-1 flex-col gap-6 ${SCROLL_PANE}`}
      >
        {/*
          큰 제목을 걷어냈다. 달력 자체가 무슨 화면인지 말하고 있어서,
          위에 "이번 달은 몇 건이에요" 를 크게 얹으면 격자와 눈싸움만 한다 —
          같은 숫자는 오른쪽 "이번 주" 칸이 이미 세고 있다.

          좁은 화면에선 조작부를 라벨 아래로 내린다. 한 줄에 같이 두면
          320px 에서 버튼 셋이 130px 을 가져가 라벨이 눌린다.
        */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Kicker>{rangeLabel(range, anchor)}</Kicker>
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
        <ConnectedCalendars
          feed={feed}
          subscriptions={subscriptions}
          busy={toggling}
          onToggle={(item) => void toggleCalendar(item)}
        />
        <RangePicker value={range} onChange={setRange} />
      </aside>
    </div>
  );

  /**
   * 스트립의 체크박스. 설정 화면의 것과 같은 값을 토글한다.
   *
   * 먼저 화면에 반영하고 실패하면 되돌린다 — 여기선 되돌리는 값이 싸다.
   * 성공하면 reloadKey 를 올려 달력을 다시 받아온다. 안 올리면 체크만
   * 움직이고 일정은 그대로라 "안 먹혔다" 로 보인다.
   */
  async function toggleCalendar(item: CalendarSubscription) {
    if (!subscriptions) return;
    const before = subscriptions;
    setSubscriptions(
      subscriptions.map((entry) =>
        entry.id === item.id ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    );
    setToggling(true);
    const result = await toggleSubscription(config, item.id, !item.enabled);
    setToggling(false);

    if (result.kind === "ok") {
      setSubscriptions(result.subscriptions);
      setReloadKey((key) => key + 1);
      return;
    }
    setSubscriptions(before); // 되돌린다
  }

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
  const rows = troubles(feed);

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
              index === 0 || index === 6 ? "text-mid" : "text-dim"
            }`}
          >
            {day}
          </span>
        ))}
      </div>
      {/* 주 단위로 끊어 그린다. 띠가 한 주 안에서만 이어지기 때문이다 */}
      <div className="flex flex-col gap-1 sm:gap-2">
        {layoutBands(cells, events).map(({ row, bands }) => (
          <WeekRow
            key={row[0].date}
            row={row}
            bands={bands}
            events={events}
            today={today}
            anchor={anchor}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 여러 날 일정은 목록에 한 번만 올린다.
 *
 * 서버가 날마다 한 건씩 주기 때문에 "다음 7일" 에 2주짜리 일정이 들어오면
 * 같은 줄이 일곱 번 반복된다 — 목록이 그 일정 하나로 다 찬다.
 * 격자에서 띠로 묶은 것과 같은 이유이고, 남기는 건 제일 이른 날 하나다.
 */
function oncePerSpan<T extends UpcomingItem & { spanId?: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.spanId) return true;
    if (seen.has(item.spanId)) return false;
    seen.add(item.spanId);
    return true;
  });
}

/** 42칸(또는 7칸)을 주 단위로 자른다. */
function weekRows(cells: MonthCell[]): MonthCell[][] {
  const rows: MonthCell[][] = [];
  for (let at = 0; at < cells.length; at += 7) rows.push(cells.slice(at, at + 7));
  return rows;
}

/** 격자 위에 얹는 여러 날 일정 띠 한 조각. */
type Band = {
  key: string;
  label: string;
  /** 0=일요일 */
  startCol: number;
  span: number;
  /** 이 조각의 왼쪽이 일정의 진짜 시작인가 */
  capStart: boolean;
  /** 오른쪽이 진짜 끝인가 */
  capEnd: boolean;
  /** 몇 번째 층에 앉을지. 겹치는 띠를 위아래로 쌓는다 */
  lane: number;
};

const LANE_HEIGHT = 20;
const LANE_GAP = 4;

/**
 * 이 주에 걸쳐 있는 띠들.
 *
 * 같은 일정이 여러 칸에 흩어져 있는 걸 spanId 로 도로 묶어서,
 * 이 주에서 처음 나온 칸부터 마지막 칸까지 한 조각으로 만든다.
 *
 * 모서리가 곧 "이어짐" 표시다 — 진짜 시작·끝인 쪽만 둥글게 막고
 * 주 경계에서 잘린 쪽은 평평하게 둬서 다음 줄로 이어지는 것처럼 보이게 한다.
 * 그래서 조회 창 밖에서 시작한 일정도 따로 처리할 게 없다: 시작이 안 보이면
 * capStart 가 false 라 저절로 평평해지고 라벨이 "계속" 이 된다.
 */
/**
 * 격자 전체의 띠를 위에서부터 배치한다.
 *
 * 제목을 어느 조각에 쓸지는 한 주만 봐서는 정할 수 없어서 여기서 정한다 —
 * 아래 주석(labelled) 참고.
 */
function layoutBands(
  cells: MonthCell[],
  events: Map<string, DayEvent[]>,
): { row: MonthCell[]; bands: Band[] }[] {
  /*
   * 이 격자에서 제목을 이미 쓴 일정들.
   *
   * 도면은 "첫 조각에만 제목" 이라고 하는데, 도면엔 일정이 창 안에서
   * 시작하는 경우만 그려져 있다. 시작일이 창 밖인 달(8/25 시작인 일정을
   * 9월에서 보는 경우)에 그 규칙을 곧이곧대로 쓰면 제목이 **한 번도**
   * 안 나오고 "계속" 짜리 띠만 남는다 — 무슨 일정인지 알 수가 없다.
   *
   * 그래서 "진짜 시작" 이 아니라 "이 격자에서 처음 보이는 조각" 에 제목을
   * 쓴다. 창 안에서 시작하는 일정은 둘이 같은 조각이라 도면과 결과가
   * 똑같고, 창 밖에서 시작한 일정만 제목을 얻는다. 이전부터 이어져 왔다는
   * 사실은 도면대로 **평평한 왼쪽 모서리**가 말한다.
   */
  const labelled = new Set<string>();
  return weekRows(cells).map((row) => ({
    row,
    bands: bandsFor(row, events, labelled),
  }));
}

function bandsFor(
  row: MonthCell[],
  events: Map<string, DayEvent[]>,
  labelled: Set<string>,
): Band[] {
  const found = new Map<
    string,
    { first: number; last: number; event: DayEvent }
  >();

  row.forEach((cell, col) => {
    for (const event of events.get(cell.date) ?? []) {
      if (!event.spanId) continue;
      const seen = found.get(event.spanId);
      if (seen) seen.last = col;
      else found.set(event.spanId, { first: col, last: col, event });
    }
  });

  const bands = [...found.entries()]
    .map(([key, { first, last, event }]) => {
      // 이 격자에서 처음 보이는 조각에만 제목을 쓴다. 이어지는 조각까지
      // 제목을 반복하면 원래 문제(칸마다 같은 제목)가 그대로 돌아온다.
      const label = labelled.has(key) ? "계속" : event.title;
      labelled.add(key);
      return {
        key,
        label,
        startCol: first,
        span: last - first + 1,
        // 모서리는 라벨과 따로 논다 — 이건 실제 시작·끝만 둥글게 막는다.
        capStart: event.spanStart === row[first].date,
        capEnd: event.spanEnd === row[last].date,
        lane: 0,
      };
    })
    // 왼쪽부터, 같은 자리면 긴 것부터 쌓아야 층이 덜 지저분하다.
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span);

  // 겹치지 않는 띠끼리는 같은 층을 쓴다.
  const lanes: Band[][] = [];
  for (const band of bands) {
    const end = band.startCol + band.span - 1;
    let index = lanes.findIndex((lane) =>
      lane.every((other) => {
        const otherEnd = other.startCol + other.span - 1;
        return band.startCol > otherEnd || end < other.startCol;
      }),
    );
    if (index === -1) index = lanes.push([]) - 1;
    lanes[index].push(band);
    band.lane = index;
  }

  return bands;
}

function WeekRow({
  row,
  bands,
  events,
  today,
  anchor,
  onPick,
}: {
  row: MonthCell[];
  bands: Band[];
  events: Map<string, DayEvent[]>;
  today: string;
  anchor: string;
  onPick: (date: string) => void;
}) {
  const laneCount = bands.reduce((most, band) => Math.max(most, band.lane + 1), 0);

  return (
    <div className="relative">
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {row.map((cell) => (
          <DayCell
            key={cell.date}
            cell={cell}
            events={events.get(cell.date) ?? []}
            isToday={cell.date === today}
            isPicked={cell.date === anchor}
            onPick={onPick}
            laneCount={laneCount}
          />
        ))}
      </div>

      {/*
        띠는 칸 위에 얹는다 — 칸 하나에 넣으면 이웃 칸으로 넘어갈 수 없다.
        칸 격자와 열·간격이 똑같아야 경계가 맞고, pointer-events-none 이라야
        띠를 눌러도 그 아래 날짜가 눌린다.
        sm 미만에선 안 그린다: 좁은 화면은 칩 대신 점만 찍는 화면이라
        띠를 얹을 자리가 없다.
      */}
      {laneCount > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden grid-cols-7 content-start gap-x-2 gap-y-1 pt-8 sm:grid"
        >
          {bands.map((band) => (
            <span
              key={band.key}
              style={{
                gridColumn: `${band.startCol + 1} / span ${band.span}`,
                gridRow: band.lane + 1,
              }}
              className={`flex h-5 items-center overflow-hidden text-[11px] leading-none whitespace-nowrap bg-accent text-bg ${
                band.capStart
                  ? "ml-[9px] rounded-l-full pl-[9px]"
                  : "rounded-l-none pl-[6px]"
              } ${
                band.capEnd
                  ? "mr-[9px] rounded-r-full pr-[9px]"
                  : "rounded-r-none pr-[6px]"
              }`}
            >
              <span className="truncate">{band.label}</span>
            </span>
          ))}
        </div>
      ) : null}
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
  laneCount,
}: {
  cell: MonthCell;
  events: DayEvent[];
  isToday: boolean;
  isPicked: boolean;
  onPick: (date: string) => void;
  /** 이 주에 깔린 띠의 층 수. 0이면 자리를 비우지 않는다 */
  laneCount: number;
}) {
  /*
    여러 날 일정은 칩으로 안 그린다 — 위에 띠가 지나간다.
    점(좁은 화면)과 aria-label 은 events 를 그대로 쓴다: 띠를 안 그리는
    화면에서도 그날 일정이 있다는 사실 자체는 같기 때문이다.
  */
  const chips = events.filter((event) => !event.spanId);
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

      {/*
        띠가 지나갈 자리를 비운다. 이 칸에 띠가 안 걸쳐도 같은 높이를 비워야
        한 줄의 일곱 칸이 같은 자리에서 칩을 시작한다 — 안 그러면 띠 아래
        칩들이 칸마다 들쭉날쭉해진다.
      */}
      {laneCount > 0 ? (
        <span
          aria-hidden="true"
          style={{
            height: laneCount * LANE_HEIGHT + (laneCount - 1) * LANE_GAP,
          }}
          className="hidden shrink-0 sm:block"
        />
      ) : null}

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
        {chips.map((event) => (
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
  briefing: Briefing | null;
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
  briefing: Briefing | null,
): { today: number; week: number; empty: number } {
  if (soon.state !== "live") {
    if (!briefing) return { today: 0, week: 0, empty: week.length };
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
 *
 * 체크를 다 꺼둔 상태(paused)를 따로 적는 이유도 같다. 붙어 있는데
 * "아직 연결 전" 이라고 하면 거짓말이고, 설정에서 할 일도 정반대다 —
 * 붙이러 가는 게 아니라 켜러 간다.
 */
function ConnectedCalendars({
  feed,
  subscriptions,
  busy,
  onToggle,
}: {
  feed: Feed;
  subscriptions: CalendarSubscription[] | null;
  busy: boolean;
  onToggle: (item: CalendarSubscription) => void;
}) {
  const registered = subscriptions ?? [];
  const allOff = registered.length > 0 && registered.every((s) => !s.enabled);

  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>연결된 캘린더</Kicker>
      <div className="flex flex-col items-start gap-2 rounded-xl border border-line px-4 py-3.5">
        {registered.length > 0 ? (
          <>
            {/*
              ⚠ 다 꺼져도 이 목록은 남아야 한다. 목록을 숨기면 마지막 하나를
                끈 사람이 여기서 다시 켤 방법을 잃는다.
            */}
            <ul className="flex w-full flex-col">
              {registered.map((item) => (
                <li key={item.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => onToggle(item)}
                      disabled={busy}
                      className="size-4 shrink-0 accent-[var(--accent)]"
                    />
                    {/*
                      색은 캘린더가 들고 온 값이라 토큰이 아니라 style 로 간다.
                      없을 수도 있어서(색이 생기기 전에 붙인 것) 그때는
                      역할 토큰으로 떨어진다. 옅은 색이 밝은 바탕에서 사라지지
                      않도록 테두리를 한 겹 두른다.
                    */}
                    <span
                      aria-hidden="true"
                      style={
                        item.color ? { background: `#${item.color}` } : undefined
                      }
                      className={`size-2.5 shrink-0 rounded-full border border-line ${
                        item.color ? "" : "bg-accent"
                      } ${item.enabled ? "" : "opacity-40"}`}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-xs break-keep ${
                        item.enabled ? "" : "text-dim"
                      }`}
                    >
                      {item.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {allOff ? (
              <>
                <Tag>모두 꺼져 있어요</Tag>
                <p className="text-xs leading-relaxed break-keep text-dim">
                  붙여둔 캘린더는 그대로 있어요. 체크를 켜면 다시 채워집니다.
                </p>
              </>
            ) : (
              <p className="text-xs leading-relaxed break-keep text-dim">
                체크한 캘린더만 불러와요
              </p>
            )}
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 text-sm">
              <CalendarX size={16} strokeWidth={1.5} className="text-dim" />
              네이버 캘린더
            </span>
            <Tag>
              {subscriptions === null || feed.state === "loading"
                ? "확인하는 중이에요"
                : "아직 연결 전이에요"}
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
          설정에서 {registered.length > 0 ? "연결 관리" : "연결하기"} →
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
