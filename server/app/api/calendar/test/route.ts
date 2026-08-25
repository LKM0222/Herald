import { shiftISO, todayISO } from "@shared/date";
import { fetchRange } from "@/lib/calendar/connection";
import { isAuthorized, json, preflight, unauthorized } from "@/lib/http";

/**
 * 캘린더가 실제로 붙는지 확인한다.
 *
 * 저장된 자격증명으로 캘린더 목록을 찾고, 앞뒤 한 달을 실제로 조회해 본다.
 * 목록만 확인하면 "로그인은 되는데 조회 권한이 없는" 경우를 못 잡는다.
 *
 * ⚠ 일정 내용은 돌려주지 않는다. 붙었는지와 몇 건인지만 준다 —
 *   해석은 다음 단계 몫이고, 여기서 원문을 흘리면 확인용 응답이 일정 덤프가 된다.
 */
export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  const today = todayISO();
  const result = await fetchRange(shiftISO(today, -30), shiftISO(today, 30));

  if (!result.ok) {
    // 연결 실패는 서버 고장이 아니다. 200 으로 주고 화면이 사유를 읽게 한다.
    return json({ ok: false, kind: result.kind, message: result.message }, { origin });
  }

  return json(
    {
      ok: true,
      calendars: result.calendars.map((calendar) => calendar.name),
      /** 앞뒤 30일 안에서 찾은 VEVENT 묶음 수 */
      found: result.raw.length,
    },
    { origin },
  );
}
