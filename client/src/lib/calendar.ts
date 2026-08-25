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

export const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

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

export function monthGrid(year: number, month: number): MonthCell[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  // 1일이 무슨 요일이든 그 주의 월요일부터 시작한다.
  const start = shiftISO(`${prefix}-01`, -weekdayIndex(`${prefix}-01`));

  return Array.from({ length: CELLS }, (_, index) => {
    const date = shiftISO(start, index);
    return {
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date.startsWith(prefix),
      weekend: index % 7 >= 5,
    };
  });
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

/** 종일 일정이 먼저, 그다음 시작 시각 순. */
function byStartTime(a: DayEvent, b: DayEvent): number {
  const allDay = Number(b.allDay ?? false) - Number(a.allDay ?? false);
  return allDay !== 0 ? allDay : a.time.localeCompare(b.time);
}

/** 칩에 쓰는 짧은 표기. 종일 일정은 시각 자리에 "종일"이 온다. */
export function eventLabel(event: DayEvent | ScheduleItem): string {
  return event.allDay ? "종일" : event.time;
}
