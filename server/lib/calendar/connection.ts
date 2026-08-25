import { getSecret } from "../secrets";
import {
  CalDavError,
  discoverCalendars,
  fetchEventData,
  probeCalendar,
  type CalendarRef,
  type Credentials,
  type FailureKind,
  type Probe,
} from "./caldav";

/**
 * 저장된 자격증명으로 캘린더에 붙는다.
 *
 * caldav.ts 는 프로토콜만 안다. 값이 어디서 오는지는 여기서만 안다 —
 * 그래야 나중에 구글 iCal 주소 같은 다른 출처를 붙일 때 프로토콜 코드를 안 건드린다.
 */

export type ConnectionResult =
  | { ok: true; calendars: CalendarRef[] }
  | { ok: false; kind: FailureKind | "not_configured"; message: string };

/** 화면에서 넣었든 .env 로 왔든 secrets.ts 가 알아서 고른다. */
function credentials(): Credentials | null {
  const user = getSecret("naver_id");
  const password = getSecret("naver_password");
  if (!user || !password) return null;
  return { user, password };
}

export function isConfigured(): boolean {
  return credentials() !== null;
}

/**
 * 붙는지 확인한다.
 *
 * 이게 없으면 앱 비밀번호가 틀려도 그냥 빈 달력으로 보인다 —
 * "연결됐는데 일정이 없음"과 구분되지 않는 게 이 기능에서 제일 나쁜 실패다.
 */
export async function testConnection(): Promise<ConnectionResult> {
  const auth = credentials();
  if (!auth) {
    return {
      ok: false,
      kind: "not_configured",
      message: "아이디와 앱 비밀번호를 먼저 저장해 주세요",
    };
  }

  try {
    return { ok: true, calendars: await discoverCalendars(auth) };
  } catch (error) {
    return toFailure(error);
  }
}

export type FetchResult =
  | { ok: true; calendars: CalendarRef[]; raw: string[] }
  | { ok: false; kind: FailureKind | "not_configured"; message: string };

/**
 * 기간 안의 일정을 ICS 원문으로 가져온다. 해석은 다음 단계 몫이다.
 *
 * 캘린더가 여러 개면 전부 합친다 — 개인 계정에서 "업무"와 "개인"을 나눠 쓰는 게
 * 흔하고, 하나만 읽으면 절반이 조용히 사라진다.
 */
export async function fetchRange(
  from: string,
  to: string,
): Promise<FetchResult> {
  const auth = credentials();
  if (!auth) {
    return {
      ok: false,
      kind: "not_configured",
      message: "아이디와 앱 비밀번호를 먼저 저장해 주세요",
    };
  }

  try {
    const calendars = await discoverCalendars(auth);
    const raw: string[] = [];
    for (const calendar of calendars) {
      raw.push(...(await fetchEventData(auth, calendar.url, from, to)));
    }
    return { ok: true, calendars, raw };
  } catch (error) {
    return toFailure(error);
  }
}

/** 진단. "일정이 없는 것"과 "조회가 안 먹는 것"을 가른다. */
export async function probeAll(
  from: string,
  to: string,
): Promise<
  | { ok: true; probes: Probe[] }
  | { ok: false; kind: FailureKind | "not_configured"; message: string }
> {
  const auth = credentials();
  if (!auth) {
    return { ok: false, kind: "not_configured", message: "자격증명이 없어요" };
  }
  try {
    const calendars = await discoverCalendars(auth);
    const probes: Probe[] = [];
    for (const calendar of calendars) {
      probes.push(await probeCalendar(auth, calendar, from, to));
    }
    return { ok: true, probes };
  } catch (error) {
    return toFailure(error);
  }
}

function toFailure(error: unknown): { ok: false; kind: FailureKind; message: string } {
  if (error instanceof CalDavError) {
    return { ok: false, kind: error.kind, message: error.message };
  }
  // 여기 오면 우리가 예상 못 한 것이다. 삼키지 말고 로그에 남긴다.
  console.error("[herald] 캘린더 연결 실패:", error);
  return {
    ok: false,
    kind: "protocol",
    message: "알 수 없는 오류가 났어요",
  };
}
