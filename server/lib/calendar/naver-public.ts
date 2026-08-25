import type { CalendarEvent } from "@shared/types";

/**
 * 네이버 공개 캘린더 — 주소 하나로 읽는다.
 *
 * CalDAV(caldav.ts)와 달리 아이디도 비밀번호도 필요 없다. 대신 캘린더가
 * 공개돼 있어야 하고, **publishedKey 를 아는 사람은 누구나 같은 걸 읽는다** —
 * 그래서 키는 자격증명으로 취급해 암호화해 둔다 (subscriptions.ts).
 *
 * ⚠ 공식 문서가 없는 내부 API 다. 네이버 공개 캘린더 페이지가 자기 일정을
 *   그릴 때 쓰는 호출을 그대로 쓴다. 언제든 바뀔 수 있다는 전제로,
 *   실패를 종류별로 갈라 올린다 — 화면에서 할 일이 저마다 다르다.
 *
 * ICS 를 안 거치는 대신 얻는 것:
 *   · 반복 일정을 서버가 repeatDateList 로 펼쳐서 준다 (RRULE 엔진 불필요)
 *   · endDate 가 포함(23:59:59)이라 종일 일정의 하루 빼기가 없다
 *   · 시각이 이미 KST 문자열이라 TZID 변환이 없다
 */

const BASE = "https://calendar.naver.com";
const TIMEOUT_MS = 15_000;

/** 단축주소를 따라가되 네이버 밖으로는 안 나간다. 임의 주소를 대신 열어주면 안 된다. */
const ALLOWED_HOSTS = new Set([
  "naver.me",
  "calendar.naver.com",
  "m.calendar.naver.com",
]);

/** 공식 클라이언트가 분 단위로 자리를 잡는 유일한 타입(hour*6 + minute/10). */
const TIMED_TYPE = 3;

/** 한 일정이 하루씩 펼쳐질 수 있는 최대 일수. 잘못된 값 하나로 응답이 터지지 않게. */
const MAX_SPAN_DAYS = 400;

export type PublicFailure = "bad_url" | "not_found" | "network" | "protocol";

export class NaverPublicError extends Error {
  constructor(
    readonly kind: PublicFailure,
    message: string,
  ) {
    super(message);
    this.name = "NaverPublicError";
  }
}

async function get(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new NaverPublicError("network", `네이버에 닿지 못했어요 (${detail})`);
  }
}

/**
 * 주소에서 publishedKey 를 뽑는다.
 *
 * 사용자가 붙여넣는 건 대개 `https://naver.me/xxxx` 단축주소다. 그 안에는
 * 키가 없으니 한 번 따라가서 펼친 주소에서 꺼낸다.
 */
export async function resolveKey(input: string): Promise<string> {
  const trimmed = input.trim();
  if (trimmed === "") throw new NaverPublicError("bad_url", "주소를 넣어주세요");

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new NaverPublicError("bad_url", "주소 형식이 아니에요");
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new NaverPublicError(
      "bad_url",
      "네이버 캘린더 공유 주소만 넣을 수 있어요",
    );
  }

  const direct = url.searchParams.get("publishedKey");
  if (direct) return checkKey(direct);

  // 단축주소 — 펼쳐야 키가 나온다.
  const response = await get(url.toString(), { redirect: "follow" });
  const expanded = new URL(response.url);
  const key = expanded.searchParams.get("publishedKey");
  if (!key) {
    throw new NaverPublicError(
      "not_found",
      "그 주소에서 캘린더를 찾지 못했어요. 공유가 해제됐을 수 있어요",
    );
  }
  return checkKey(key);
}

function checkKey(key: string): string {
  if (!/^[0-9A-Za-z]{16,256}$/.test(key)) {
    throw new NaverPublicError("bad_url", "공유 키 형식이 아니에요");
  }
  return key;
}

export type CalendarInfo = {
  key: string;
  /** 네이버에서 붙인 캘린더 이름 */
  name: string;
  owner: string;
};

/**
 * 캘린더 이름을 알아낸다. 목록에 "0fc2c57e…" 를 늘어놓을 수는 없다.
 *
 * 겸사겸사 주소가 살아 있는지도 여기서 걸러진다 — 공유가 해제된 키는
 * oCalendarInfo 없이 오류 화면만 온다.
 */
export async function fetchInfo(key: string): Promise<CalendarInfo> {
  const response = await get(`${BASE}/publicCalendar?publishedKey=${key}`);
  if (!response.ok) {
    // 없는 키를 넣으면 네이버가 500 을 준다. "네이버 응답 500" 만 보여주면
    // 화면 앞에서 할 수 있는 게 없어서, 주소를 의심하라고 알려준다.
    throw new NaverPublicError(
      "not_found",
      `주소를 다시 확인해 주세요 (네이버 응답 ${response.status})`,
    );
  }

  const html = await response.text();
  const found = /__oInitialData\.oCalendarInfo\s*=\s*(\{.*?\});/.exec(html);
  if (!found) {
    throw new NaverPublicError(
      "not_found",
      "공개되지 않은 캘린더예요. 공유를 켰는지 확인해 주세요",
    );
  }

  let info: { name?: unknown; ownerId?: unknown; opened?: unknown };
  try {
    info = JSON.parse(found[1]) as typeof info;
  } catch {
    throw new NaverPublicError("protocol", "캘린더 정보를 읽지 못했어요");
  }

  if (info.opened === false) {
    throw new NaverPublicError("not_found", "공개가 꺼져 있는 캘린더예요");
  }

  return {
    key,
    name:
      typeof info.name === "string" && info.name ? info.name : "네이버 캘린더",
    owner: typeof info.ownerId === "string" ? info.ownerId : "",
  };
}

/** 네이버가 주는 일정 한 건. 쓰는 필드만 적는다. */
type RawSchedule = {
  scheduleId?: string;
  content?: string;
  place?: string;
  startDate?: string;
  endDate?: string;
  scheduleType?: number;
  repetitive?: boolean;
  repeatDateList?: { startDate?: string; endDate?: string }[];
};

/**
 * 기간 안의 일정을 가져온다.
 *
 * from·to 는 YYYY-MM-DD. 네이버는 "yyyy-MM-dd HH:mm:ss" 를 요구하고
 * 시각은 전부 KST 기준이라 변환하지 않는다.
 */
export async function fetchEvents(
  key: string,
  from: string,
  to: string,
  label: string,
): Promise<CalendarEvent[]> {
  const bo = JSON.stringify({
    publishedKey: key,
    startDate: `${from} 00:00:00`,
    endDate: `${to} 23:59:59`,
  });

  const response = await get(`${BASE}/ajax/public/GetScheduleList`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${BASE}/publicCalendar?publishedKey=${key}`,
    },
    body: new URLSearchParams({ bo }).toString(),
  });

  if (!response.ok) {
    throw new NaverPublicError("protocol", `네이버 응답 ${response.status}`);
  }

  let body: { result?: unknown; schedules?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // 로그인 페이지로 튕기면 JSON 이 아니라 HTML 이 온다.
    throw new NaverPublicError("not_found", "공개 캘린더로 읽히지 않아요");
  }

  if (body.result !== "success") {
    throw new NaverPublicError("protocol", "네이버가 조회를 거부했어요");
  }

  const schedules = Array.isArray(body.schedules)
    ? (body.schedules as RawSchedule[])
    : [];

  return schedules
    .flatMap((raw) => expand(raw, label))
    .filter((event) => event.date >= from && event.date <= to)
    .sort(byDateThenTime);
}

/**
 * 일정 한 건을 화면이 쓰는 모양으로 편다.
 *
 * 반복은 서버가 이미 repeatDateList 로 펼쳐서 준다 — 네이버 공식 클라이언트도
 * 반복 규칙을 해석하지 않고 이 목록을 그냥 순회한다. 그래서 RRULE 도,
 * EXDATE 예외 처리도 우리 쪽에 없다.
 */
function expand(raw: RawSchedule, label: string): CalendarEvent[] {
  const occurrences =
    raw.repetitive && raw.repeatDateList?.length
      ? raw.repeatDateList
      : [{ startDate: raw.startDate, endDate: raw.endDate }];

  const title = (raw.content ?? "").trim() || "(제목 없음)";
  const place = (raw.place ?? "").trim();
  const allDay = raw.scheduleType !== TIMED_TYPE;
  const base = raw.scheduleId ?? title;

  return occurrences.flatMap((slot, index) => {
    const start = split(slot.startDate);
    if (!start) return [];
    const end = split(slot.endDate) ?? start;

    const days = coveredDays(start, end);
    const single = days.length === 1;
    // 여러 날에 걸친 일정은 각 날짜 칸에 통째로 그린다 — 이틀째 칸의
    // "10:00" 은 그날 10시에 시작한다는 뜻이 아니라서 거짓말이 된다.
    const asAllDay = allDay || !single;

    return days.map((date) => ({
      // 하루씩 펼치면 같은 id 가 여러 칸에 앉는다. 날짜를 붙여 갈라둔다.
      id: `${base}#${index}#${date}`,
      date,
      allDay: asAllDay,
      time: asAllDay ? "" : start.time,
      ...(asAllDay ? {} : { endTime: end.time }),
      title,
      ...(place ? { place } : {}),
      calendar: label,
    }));
  });
}

type Stamp = { date: string; time: string; midnight: boolean };

/** "2026-08-25 14:00:00" → 날짜와 "14:00". 모양이 다르면 null. */
function split(value: string | undefined): Stamp | null {
  if (!value) return null;
  const found = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!found) return null;
  return {
    date: found[1],
    time: `${found[2]}:${found[3]}`,
    midnight: found[2] === "00" && found[3] === "00",
  };
}

/**
 * 일정이 걸쳐 있는 날짜들.
 *
 * 끝이 정확히 자정이고 여러 날에 걸쳐 있으면 마지막 날은 뺀다 —
 * "26일 00:00 까지"는 26일을 쓰는 게 아니라 25일이 끝난 것이다.
 */
function coveredDays(start: Stamp, end: Stamp): string[] {
  let last = end.date;
  if (last > start.date && end.midnight) last = shift(last, -1);
  if (last < start.date) last = start.date;

  const days: string[] = [];
  for (let at = start.date; at <= last; at = shift(at, 1)) {
    days.push(at);
    if (days.length >= MAX_SPAN_DAYS) break;
  }
  return days;
}

/** UTC 로만 계산한다. KST 로 만든 Date 에 toISOString 을 쓰면 하루가 밀린다. */
function shift(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function byDateThenTime(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const allDay = Number(b.allDay ?? false) - Number(a.allDay ?? false);
  return allDay !== 0 ? allDay : a.time.localeCompare(b.time);
}
