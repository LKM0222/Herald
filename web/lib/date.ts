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
