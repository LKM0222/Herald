import { isISODate } from "@shared/date";
import type { CalendarEvent } from "@shared/types";
import { isAuthorized, json, preflight, unauthorized } from "@/lib/http";
import { registeredCount, usable } from "@/lib/calendar/subscriptions";
import { fetchEvents, NaverPublicError } from "@/lib/calendar/naver-public";

/**
 * 기간 안의 일정. 일정 탭이 달을 넘길 때마다 부른다.
 *
 * 캘린더가 여러 개면 전부 합친다. 하나가 실패해도 나머지는 돌려준다 —
 * 캘린더 하나가 공유 해제됐다고 화면 전체가 비면 안 된다. 대신 실패한
 * 캘린더를 `failed` 로 함께 올려서, 화면이 "일정이 없음"과 구분할 수 있게 한다.
 */

/** 한 번에 조회할 수 있는 최대 기간. 달력 한 화면은 6주면 충분하다. */
const MAX_DAYS = 120;

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  if (!isISODate(from) || !isISODate(to) || from > to) {
    return json({ error: "bad_range" }, { status: 400, origin });
  }
  if (daysBetween(from, to) > MAX_DAYS) {
    return json({ error: "range_too_wide" }, { status: 400, origin });
  }

  const calendars = usable();
  if (calendars.length === 0) {
    /*
      둘 다 일정이 0건이지만 사용자가 할 일이 정반대다.

      - 등록이 아예 없다  → 붙이러 가야 한다 (configured: false)
      - 붙였는데 다 꺼뒀다 → 켜러 가야 한다 (paused: true)

      후자를 "아직 연결 전" 으로 뭉뚱그리면 화면이 거짓말을 한다 —
      연결은 돼 있고 본인이 꺼둔 것뿐이다.
    */
    const registered = registeredCount();
    return json(
      {
        configured: registered > 0,
        paused: registered > 0,
        calendars: [],
        events: [],
        failed: [],
      },
      { origin },
    );
  }

  const events: CalendarEvent[] = [];
  const failed: { label: string; kind: string; message: string }[] = [];

  const results = await Promise.allSettled(
    calendars.map((calendar) =>
      fetchEvents(calendar.key, from, to, calendar.label),
    ),
  );

  results.forEach((result, index) => {
    const calendar = calendars[index];
    if (result.status === "fulfilled") {
      events.push(...result.value);
      return;
    }
    const error = result.reason as unknown;
    if (error instanceof NaverPublicError) {
      failed.push({
        label: calendar.label,
        kind: error.kind,
        message: error.message,
      });
      return;
    }
    console.error("[herald] 일정 조회 실패:", error);
    failed.push({
      label: calendar.label,
      kind: "protocol",
      message: "알 수 없는 오류가 났어요",
    });
  });

  events.sort(byDateThenTime);
  return json(
    {
      configured: true,
      paused: false,
      // 그 기간에 일정이 없는 캘린더도 붙어 있긴 하다. events 에서 이름을
      // 긁어모으면 조용한 캘린더가 "연결 안 됨" 으로 보인다.
      calendars: calendars.map((calendar) => calendar.label),
      events,
      failed,
    },
    { origin },
  );
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function byDateThenTime(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const allDay = Number(b.allDay ?? false) - Number(a.allDay ?? false);
  return allDay !== 0 ? allDay : a.time.localeCompare(b.time);
}
