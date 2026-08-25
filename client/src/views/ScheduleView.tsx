import { useState, type ReactNode } from "react";
import { formatKoreanDate } from "@shared/date";
import type { Briefing } from "@shared/types";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { Kicker, Tag } from "../components/ui";
import {
  eventLabel,
  eventsByDate,
  monthGrid,
  monthOf,
  shiftMonth,
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
export function ScheduleView({
  briefing,
  today,
}: {
  briefing: Briefing;
  today: string;
}) {
  const [shown, setShown] = useState(() => monthOf(briefing.date));
  const cells = monthGrid(shown.year, shown.month);
  const events = eventsByDate(briefing);
  const now = monthOf(today);
  const isCurrentMonth = shown.year === now.year && shown.month === now.month;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Kicker>
              {shown.year}년 {shown.month}월
            </Kicker>
            {/* break-keep — 안 주면 좁은 화면에서 "몰 / 려 있죠" 처럼 낱말이 쪼개진다 */}
            <h2 className="max-w-[32ch] break-keep font-display text-2xl leading-tight sm:text-[27px]">
              {summarize(cells, events, today, isCurrentMonth)}
            </h2>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {/*
              직전 값을 함수로 받는다. shown 을 그대로 읽으면 빠르게 두 번 누를 때
              두 번 다 같은 달에서 계산해 한 번이 사라진다.
            */}
            <MonthStep
              label="지난 달"
              onClick={() =>
                setShown((at) => shiftMonth(at.year, at.month, -1))
              }
            >
              <ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />
            </MonthStep>
            <MonthStep
              label="다음 달"
              onClick={() => setShown((at) => shiftMonth(at.year, at.month, 1))}
            >
              <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
            </MonthStep>
          </div>
        </div>

        <MonthCalendar cells={cells} events={events} today={today} />

        <section className="flex flex-col gap-2.5">
          <h3 className="font-display text-sm uppercase tracking-[0.1em] text-dim">
            다음 7일
          </h3>
          {briefing.upcoming.length === 0 ? (
            <p className="text-sm text-dim">앞으로 잡힌 일정이 없어요.</p>
          ) : (
            <ul className="flex flex-col">
              {briefing.upcoming.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-line py-2.5"
                >
                  <span className="w-24 shrink-0 text-[13px] text-dim">
                    {formatKoreanDate(item.date)}
                  </span>
                  <span className="w-12 shrink-0 font-display text-sm tabular-nums">
                    {eventLabel(item)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{item.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex shrink-0 flex-col gap-7 border-line lg:w-56 lg:border-l lg:pl-6">
        <WeekStats briefing={briefing} />
        <ConnectedCalendars />
        <RangePicker />
      </aside>
    </div>
  );
}

/** 달 넘김. 도면은 34px 원이지만 손가락이 닿는 곳이라 40px 로 올렸다. */
function MonthStep({
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

function MonthCalendar({
  cells,
  events,
  today,
}: {
  cells: MonthCell[];
  events: Map<string, DayEvent[]>;
  today: string;
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
}: {
  cell: MonthCell;
  events: DayEvent[];
  isToday: boolean;
}) {
  return (
    <div
      className={`flex min-h-14 min-w-0 flex-col gap-1 rounded-lg border p-1.5 sm:min-h-[84px] sm:rounded-xl sm:p-2 ${
        isToday ? "border-accent bg-accent-soft" : "border-line"
      } ${cell.inMonth ? "" : "opacity-45"}`}
    >
      <span
        className={`font-display text-sm tabular-nums sm:text-[15px] ${
          isToday ? "text-accent" : cell.weekend ? "text-mid" : ""
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
            title={`${eventLabel(event)} ${event.title}`}
            className={`truncate rounded-md px-1.5 py-0.5 text-[11px] leading-[1.35] ${
              isToday ? "bg-surface" : "bg-accent-soft text-accent-ink"
            }`}
          >
            {eventLabel(event)} {event.title}
          </span>
        ))}
      </span>
    </div>
  );
}

/** 도면의 "이번 달은 네 건이에요. 오늘 두 건이 몰려 있죠." 자리. */
function summarize(
  cells: MonthCell[],
  events: Map<string, DayEvent[]>,
  today: string,
  isCurrentMonth: boolean,
): string {
  const total = cells
    .filter((cell) => cell.inMonth)
    .reduce((sum, cell) => sum + (events.get(cell.date)?.length ?? 0), 0);

  if (!isCurrentMonth) {
    return total === 0
      ? "이 달은 아직 아무것도 없어요."
      : `이 달은 ${total}건이에요.`;
  }
  if (total === 0) return "이번 달은 아직 비어 있어요.";

  const todayCount = events.get(today)?.length ?? 0;
  return todayCount === 0
    ? `이번 달은 ${total}건이에요. 오늘은 비어 있죠.`
    : `이번 달은 ${total}건이에요. 오늘 ${todayCount}건이 몰려 있죠.`;
}

function WeekStats({ briefing }: { briefing: Briefing }) {
  const weekTotal =
    briefing.week.reduce((sum, day) => sum + day.count, 0) +
    briefing.upcoming.length;
  const emptyDays = briefing.week.filter((day) => day.count === 0).length;

  const rows = [
    { label: "오늘", value: briefing.schedule.length, accent: true },
    { label: "이번 주", value: weekTotal, accent: false },
    { label: "비어 있는 날", value: emptyDays, accent: false },
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

function ConnectedCalendars() {
  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>연결된 캘린더</Kicker>
      <div className="flex flex-col items-start gap-2 rounded-xl border border-line px-4 py-3.5">
        <span className="flex items-center gap-2 text-sm">
          <CalendarX size={16} strokeWidth={1.5} className="text-dim" />
          네이버 캘린더
        </span>
        <Tag>아직 연결 전이에요</Tag>
        <p className="text-xs leading-relaxed text-dim">
          연결 전이라 달력에는 오늘과 다음 7일만 채워져요.
        </p>
        <a
          href={`${hrefFor("settings")}#calendar`}
          className="text-[13px] text-accent hover:underline"
        >
          설정에서 연결하기 →
        </a>
      </div>
    </section>
  );
}

/** 일 · 주 · 월. 지금 그릴 수 있는 건 월뿐이라 나머지는 눌리지 않는다. */
const RANGES = [
  { id: "day", label: "일" },
  { id: "week", label: "주" },
  { id: "month", label: "월" },
] as const;

function RangePicker() {
  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>보기</Kicker>
      <div className="flex overflow-hidden rounded-xl border border-line">
        {RANGES.map((range) => {
          const active = range.id === "month";
          return (
            <button
              key={range.id}
              type="button"
              disabled={!active}
              aria-pressed={active}
              title={
                active
                  ? "월간 보기"
                  : `${range.label}간 보기 — 다음 단계에서 연결됩니다`
              }
              className={`min-h-10 flex-1 border-l border-line text-sm first:border-l-0 ${
                active
                  ? "bg-accent font-medium text-bg"
                  : "cursor-not-allowed text-dim opacity-45"
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
