import { shiftISO, weekdayIndex } from "@shared/date";
import type { Briefing, ScheduleItem } from "@shared/types";

/**
 * 달력을 그리는 데 필요한 것들.
 *
 * 홈의 미니 달력과 일정 탭의 월간 달력이 같은 계산을 쓴다.
 * 두 군데서 각자 날짜를 더하기 시작하면 한쪽만 하루씩 밀리는 일이 생긴다.
 *
 * ⚠ 날짜 산술은 전부 @shared/date 의 UTC 전용 함수를 탄다.
 *   Date 로 더하고 toISOString() 하면 서울(+09) 자정이 UTC 전날로 밀린다.
 */

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 달력 한 칸. */
export type MonthCell = {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  /** 이번 달의 날. 앞뒤를 채우는 날은 false */
  inMonth: boolean;
  weekend: boolean;
};

/**
 * 항상 6주 42칸으로 그린다.
 * 달마다 줄 수가 달라지면 넘길 때 아래 내용이 위아래로 튄다.
 */
const CELLS = 42;

/** 어느 날이든 그 주의 일요일. */
export function weekStart(date: string): string {
  return shiftISO(date, -weekdayIndex(date));
}

/**
 * start 부터 count 칸.
 * prefix("2026-08")에 속하지 않는 날은 앞뒤를 채우는 날로 표시한다.
 */
function cellsFrom(start: string, count: number, prefix: string): MonthCell[] {
  return Array.from({ length: count }, (_, index) => {
    const date = shiftISO(start, index);
    return {
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date.startsWith(prefix),
      // 일요일 시작이라 주말은 양 끝이다 — 가운데 두 칸이 아니다.
      weekend: index % 7 === 0 || index % 7 === 6,
    };
  });
}

export function monthGrid(year: number, month: number): MonthCell[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  // 1일이 무슨 요일이든 그 주의 일요일부터 시작한다.
  return cellsFrom(weekStart(`${prefix}-01`), CELLS, prefix);
}

/** 그 날이 속한 주 한 줄. 다른 달의 날은 월간과 같은 규칙으로 흐리게 둔다. */
export function weekRow(date: string): MonthCell[] {
  return cellsFrom(weekStart(date), 7, date.slice(0, 7));
}

/** 달 이동. 12월 다음은 다음 해 1월이다. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

export function monthOf(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** 그 달의 마지막 날. Date.UTC 의 0일이 전달 말일이라는 성질을 쓴다. */
function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 고른 날짜를 유지한 채 달만 옮긴다.
 *
 * 1월 31일에서 다음 달로 가면 2월 31일은 없다. 없는 날은 그 달 말일로 당긴다 —
 * 달력 앱들이 다 이렇게 하고, 안 그러면 3월로 튀어버린다.
 */
export function shiftMonthKeepingDay(date: string, delta: number): string {
  const here = monthOf(date);
  const there = shiftMonth(here.year, here.month, delta);
  const day = Math.min(
    Number(date.slice(8, 10)),
    lastDayOf(there.year, there.month),
  );
  return `${there.year}-${String(there.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type DayEvent = ScheduleItem & { date: string };

/**
 * 날짜 → 그날 일정.
 *
 * ⚠ 지금 서버가 주는 건 오늘과 다음 7일뿐이다. 그 바깥 날짜가 비어 보이는 건
 *   일정이 없어서가 아니라 **아직 모르는** 것이다. 캘린더가 붙으면 이 함수의
 *   입력만 넓어지고 그리는 쪽은 그대로다.
 */
export function eventsByDate(briefing: Briefing): Map<string, DayEvent[]> {
  const byDate = new Map<string, DayEvent[]>();

  const add = (event: DayEvent) => {
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  };

  briefing.schedule.forEach((item) => add({ ...item, date: briefing.date }));
  briefing.upcoming
    // 오늘이 양쪽에 들어오면 두 번 그려진다.
    .filter((item) => item.date !== briefing.date)
    .forEach(add);

  for (const list of byDate.values()) list.sort(byStartTime);
  return byDate;
}

/**
 * 캘린더에서 받아온 일정을 날짜별로 묶는다.
 *
 * eventsByDate 와 나누는 이유: 저쪽은 브리핑(오늘 + 다음 7일)이 입력이고
 * 이쪽은 기간을 지정해 받아온 목록이 입력이다. 둘을 한 함수로 합치면
 * "어디까지 아는가" 가 흐려진다 — 화면이 빈 칸의 의미를 그걸로 정한다.
 */
export function groupByDate(events: DayEvent[]): Map<string, DayEvent[]> {
  const byDate = new Map<string, DayEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  }
  for (const list of byDate.values()) list.sort(byStartTime);
  return byDate;
}

/** 종일 일정이 먼저, 그다음 시작 시각 순. */
function byStartTime(a: DayEvent, b: DayEvent): number {
  const allDay = Number(b.allDay ?? false) - Number(a.allDay ?? false);
  return allDay !== 0 ? allDay : a.time.localeCompare(b.time);
}

/** 칩에 쓰는 짧은 표기. 종일 일정은 시각 자리에 "종일"이 온다. */
export function eventLabel(event: DayEvent | ScheduleItem): string {
  return event.allDay ? "종일" : event.time;
}

/** 상세에 쓰는 긴 표기. 끝 시각을 아는 일정만 범위로 보여준다. */
export function eventTime(event: DayEvent | ScheduleItem): string {
  if (event.allDay) return "종일";
  return event.endTime ? `${event.time} – ${event.endTime}` : event.time;
}
