/**
 * 브리핑은 "한국 시간 기준 오늘"에 묶인다.
 * 서버가 UTC 로 돌면 자정 전후로 날짜가 하루 어긋나므로 타임존을 명시한다.
 */
const TZ = "Asia/Seoul";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD (한국 시간 기준) */
export function todayISO(): string {
  // en-CA 로케일이 YYYY-MM-DD 를 준다.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

/** "2026-08-24" → "8월 24일 (월)" */
export function formatKoreanDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

/**
 * "3시간 전" 처럼 읽는다. 브리핑에서 절대 시각은 거의 쓸모가 없다 —
 * 알고 싶은 건 "이게 방금 일인가"뿐이다.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((now.getTime() - then) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  return days === 1 ? "어제" : `${days}일 전`;
}

/**
 * 날짜 문자열 산술.
 *
 * Date 객체로 더하고 toISOString() 으로 되돌리면 UTC 변환에서 하루가 밀린다 —
 * 서울(+09)의 자정은 UTC 로 전날 15시다.
 * 그래서 날짜 문자열을 **UTC 자정으로 읽고 UTC 로만** 다룬다. 시간대가 개입할
 * 여지를 없애는 것이지 UTC 로 바꾸는 게 아니다.
 */
export function shiftISO(date: string, days: number): string {
  const point = new Date(`${date}T00:00:00Z`);
  point.setUTCDate(point.getUTCDate() + days);
  return point.toISOString().slice(0, 10);
}

/** 월요일이 0, 일요일이 6. 주를 월요일로 시작하려고 옮긴 값이다. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}
