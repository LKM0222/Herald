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
