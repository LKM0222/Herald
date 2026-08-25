import { formatKoreanDate } from "@shared/date";
import type { Briefing, ScheduleItem } from "@shared/types";
import { CalendarX } from "lucide-react";
import { Kicker, Tag } from "../components/ui";
import { hrefFor } from "../lib/views";

/**
 * 일정 탭.
 *
 * ⚠ 캘린더 연동 전이다. 지금 들어오는 건 브리핑에 실린 오늘 일정뿐이고
 *   주간 띠·다음 7일은 더미다. 비어 있으면 비어 있다고 말한다 —
 *   시간표만 그려두면 "연동됐는데 일정이 없는 것"과 구분이 안 된다.
 */
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 시간표에 그릴 시간대. 이 바깥은 접는다. */
const HOUR_FROM = 9;
const HOUR_TO = 17;

export function ScheduleView({
  briefing,
  today,
}: {
  briefing: Briefing;
  today: string;
}) {
  const timed = briefing.schedule.filter((item) => !item.allDay);
  const allDay = briefing.schedule.filter((item) => item.allDay);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <Kicker>이번 주</Kicker>
          <h2 className="max-w-[32ch] font-display text-2xl leading-tight sm:text-[27px]">
            {summarize(briefing.schedule)}
          </h2>
        </div>

        <WeekStrip week={briefing.week} today={today} />

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
            <h3 className="font-display text-sm uppercase tracking-[0.1em] text-dim">
              오늘 시간표
            </h3>
            <span className="text-xs text-dim">
              {allDay.length === 0
                ? "종일 일정은 없어요"
                : `종일 ${allDay.length}건`}
            </span>
          </div>
          <Timetable items={timed} />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-display text-sm uppercase tracking-[0.1em] text-dim">
            다음 7일
          </h3>
          {briefing.upcoming.length === 0 ? (
            <p className="text-sm text-dim">앞으로 잡힌 일정이 없어요.</p>
          ) : (
            <ul className="flex flex-col border-t border-line">
              {briefing.upcoming.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-b border-line py-2.5 text-sm"
                >
                  <span className="w-28 shrink-0 font-display text-dim">
                    {formatKoreanDate(item.date)}
                  </span>
                  <span className="w-14 shrink-0 font-display tabular-nums text-accent">
                    {item.allDay ? "종일" : item.time}
                  </span>
                  <span className="min-w-0 flex-1">{item.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex shrink-0 flex-col gap-7 border-line lg:w-56 lg:border-l lg:pl-6">
        <WeekStats briefing={briefing} />
        <ConnectedCalendars />
      </aside>
    </div>
  );
}

function summarize(items: ScheduleItem[]): string {
  if (items.length === 0) return "오늘은 비어 있어요.";
  const first = items.find((item) => !item.allDay);
  return first
    ? `오늘은 ${items.length}건이에요. 첫 일정은 ${first.time} 이죠.`
    : `오늘은 종일 일정 ${items.length}건이에요.`;
}

/** 요일 띠. 그날 일정 수만큼 점을 찍는다 (최대 3개). */
function WeekStrip({
  week,
  today,
}: {
  week: Briefing["week"];
  today: string;
}) {
  if (week.length === 0) return null;

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {week.map((day, index) => {
        const isToday = day.date === today;
        return (
          <div
            key={day.date}
            className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 ${
              isToday ? "border-accent bg-accent-soft" : "border-line"
            }`}
          >
            <span className="text-[11px] text-dim">{DAY_LABELS[index]}</span>
            <span
              className={`font-display text-lg ${isToday ? "text-accent" : ""}`}
            >
              {Number(day.date.slice(8, 10))}
            </span>
            <span className="flex h-1.5 items-center gap-0.5">
              {Array.from({ length: Math.min(day.count, 3) }, (_, dot) => (
                <span
                  key={dot}
                  className={`size-1 rounded-full ${
                    isToday ? "bg-accent" : "bg-dim"
                  }`}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 시간대별 격자.
 * 일정은 시작 시각이 속한 칸에 붙인다 — 분 단위 위치 계산은 실제 데이터가
 * 들어온 뒤에 해도 늦지 않다.
 */
function Timetable({ items }: { items: ScheduleItem[] }) {
  const hours = Array.from(
    { length: HOUR_TO - HOUR_FROM + 1 },
    (_, index) => HOUR_FROM + index,
  );

  return (
    <div className="flex flex-col">
      {hours.map((hour) => {
        const label = `${String(hour).padStart(2, "0")}:00`;
        const here = items.filter(
          (item) => Number(item.time.slice(0, 2)) === hour,
        );
        return (
          <div
            key={hour}
            className="flex min-h-11 items-start gap-4 border-b border-line py-1.5"
          >
            <span className="w-12 shrink-0 pt-1.5 font-display tabular-nums text-xs text-dim">
              {label}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {here.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border-l-2 border-accent bg-accent-soft px-3 py-1.5"
                >
                  <span className="block text-sm">{item.title}</span>
                  <span className="block text-[11px] text-dim">
                    {item.endTime ? `${item.time} – ${item.endTime}` : item.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
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
