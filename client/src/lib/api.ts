import type {
  Briefing,
  CalendarEvent,
  CalendarSubscription,
  NewsSchedule,
  QuizSession,
  QuizSessionSummary,
  SecretStatus,
} from "@shared/types";
import type { Config } from "./config";

/**
 * 실패를 종류별로 구분해 돌려준다.
 * "주소가 틀렸다"와 "인증이 안 됐다"와 "그날 데이터가 없다"는
 * 사용자가 해야 할 일이 전부 달라서, 하나의 오류로 뭉뚱그리면 안 된다.
 */
export type Failure =
  | { kind: "unauthorized" }
  | { kind: "unreachable"; message: string };

export type Result<T> = ({ kind: "ok" } & T) | Failure;

export type BriefingResult = Result<{ briefing: Briefing | null }>;
export type SettingsResult = Result<{
  enabledSources: string[];
  schedule: NewsSchedule;
}>;

/**
 * 답이 없는 요청을 여기서 끊는다.
 *
 * fetch 는 스스로 포기하지 않는다. 서버가 연결만 받아 두고 아무 말도 안 하면
 * 약속이 영영 안 풀리고, 화면은 그 사이 계속 "기다리는 중" 으로 돈다 —
 * 사용자가 볼 수 있는 건 영원히 도는 원뿐이고 다시 시도할 길도 없다.
 * 끊어서 실패로 만들어야 화면이 사유를 말하고 버튼을 내준다.
 */
const TIMEOUT_MS = 20_000;

/**
 * 모든 요청의 공통 처리.
 * 브라우저는 "서버가 꺼짐 · 주소 오타 · CORS 차단"을 구분해 알려주지 않아서
 * 셋 다 unreachable 로 온다 — 화면에서 세 가능성을 함께 안내한다.
 */
async function request(
  config: Config,
  path: string,
  init?: RequestInit,
): Promise<Response | Failure> {
  try {
    const response = await fetch(`${config.apiBase}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (response.status === 401) return { kind: "unauthorized" };
    if (!response.ok) {
      return { kind: "unreachable", message: await describeError(response) };
    }
    return response;
  } catch (error) {
    // 시간이 다 된 것과 못 닿은 것은 사용자가 할 일이 다르다. 브라우저가 주는
    // "signal timed out" 을 그대로 내보내면 무슨 말인지 알 수 없다.
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        kind: "unreachable",
        message: `서버가 ${TIMEOUT_MS / 1000}초 안에 답하지 않았어요`,
      };
    }
    return {
      kind: "unreachable",
      message: error instanceof Error ? error.message : "연결 실패",
    };
  }
}

/**
 * 서버가 보낸 오류 코드를 사람 말로 바꾼다.
 * "서버 응답 500" 만 보여주면 화면 앞에서 할 수 있는 게 없다.
 */
async function describeError(response: Response): Promise<string> {
  let code = "";
  let message = "";
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
    };
    code = body.error ?? "";
    // 서버가 사람 말로 사유를 붙여 보냈으면 그게 코드보다 쓸모 있다.
    if (typeof body.message === "string") message = body.message;
  } catch {
    // 본문이 JSON 이 아니면 상태 코드만으로 말한다.
  }
  if (message) return message;
  if (code === "storage_unwritable") {
    return "서버가 저장에 실패했습니다. 데이터 폴더 권한을 확인해 주세요.";
  }
  return code ? `${code} (HTTP ${response.status})` : `서버 응답 ${response.status}`;
}

function isFailure(value: Response | Failure): value is Failure {
  return "kind" in value;
}

export async function fetchBriefing(
  config: Config,
  date: string,
): Promise<BriefingResult> {
  const response = await request(config, `/api/briefing/${date}`);
  if (isFailure(response)) return response;
  const body = (await response.json()) as { briefing: Briefing | null };
  return { kind: "ok", briefing: body.briefing };
}

type SettingsBody = {
  settings: { enabledSources: string[]; schedule: NewsSchedule };
};

export async function fetchSettings(config: Config): Promise<SettingsResult> {
  const response = await request(config, "/api/settings");
  if (isFailure(response)) return response;
  const body = (await response.json()) as SettingsBody;
  return {
    kind: "ok",
    enabledSources: body.settings.enabledSources,
    schedule: body.settings.schedule,
  };
}

/**
 * ⚠ 서버는 받은 것을 **통째로** 저장한다. 둘 중 하나만 보내면 나머지가 사라진다.
 *   그래서 인자 두 개를 모두 필수로 뒀다 — 부르는 쪽이 지금 값을 들고 있게 강제한다.
 *   소스 체크박스만 건드렸는데 켜둔 자동 실행이 꺼지는 사고를 막는다.
 */
export async function saveSettings(
  config: Config,
  enabledSources: string[],
  schedule: NewsSchedule,
): Promise<SettingsResult> {
  const response = await request(config, "/api/settings", {
    method: "POST",
    body: JSON.stringify({ enabledSources, schedule }),
  });
  if (isFailure(response)) return response;
  const body = (await response.json()) as SettingsBody;
  return {
    kind: "ok",
    enabledSources: body.settings.enabledSources,
    schedule: body.settings.schedule,
  };
}

/** 비밀번호가 설정돼 있는지. 로그인 전에 물어야 해서 인증이 없다. */
export async function fetchAuthStatus(
  apiBase: string,
): Promise<{ hasPassword: boolean } | null> {
  try {
    const response = await fetch(`${apiBase}/api/auth/status`);
    if (!response.ok) return null;
    return (await response.json()) as { hasPassword: boolean };
  } catch {
    // 주소가 틀렸거나 서버가 꺼져 있다. 화면은 이 경우 비밀번호 칸을 보여주고
    // 실제 실패는 로그인 시도에서 드러낸다.
    return null;
  }
}

export type LoginResult =
  | { kind: "ok"; token: string }
  | { kind: "wrong" }
  | { kind: "throttled"; retryAfter: number }
  | { kind: "unreachable"; message: string };

export async function login(
  apiBase: string,
  password: string,
): Promise<LoginResult> {
  try {
    const response = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.status === 401) return { kind: "wrong" };
    if (response.status === 429) {
      const body = (await response.json()) as { retryAfter?: number };
      return { kind: "throttled", retryAfter: body.retryAfter ?? 60 };
    }
    if (!response.ok) {
      return { kind: "unreachable", message: `서버 응답 ${response.status}` };
    }
    const body = (await response.json()) as { token: string };
    return { kind: "ok", token: body.token };
  } catch (error) {
    return {
      kind: "unreachable",
      message: error instanceof Error ? error.message : "연결 실패",
    };
  }
}

export type PasswordResult =
  | { kind: "ok"; token: string | null }
  | { kind: "too_short"; minLength: number }
  | Failure;

export async function setPassword(
  config: Config,
  password: string,
): Promise<PasswordResult> {
  const response = await request(config, "/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  if (isFailure(response)) {
    // 400(너무 짧음)은 request 가 unreachable 로 싸버리므로 여기서 되살린다.
    if (response.kind === "unreachable" && response.message.includes("too_short")) {
      return { kind: "too_short", minLength: 8 };
    }
    return response;
  }
  const body = (await response.json()) as { token?: string };
  return { kind: "ok", token: body.token ?? null };
}

// ── 자격증명 ─────────────────────────────────────────────
// 값은 절대 내려오지 않는다. 설정 여부와 끝 네 자리만 온다.

export type SecretsResult = Result<{
  secrets: SecretStatus[];
  canStore: boolean;
}>;

export async function fetchSecrets(config: Config): Promise<SecretsResult> {
  const response = await request(config, "/api/secrets");
  if (isFailure(response)) return response;
  const body = (await response.json()) as {
    secrets: SecretStatus[];
    canStore: boolean;
  };
  return { kind: "ok", secrets: body.secrets, canStore: body.canStore };
}

export type SaveSecretResult =
  | { kind: "ok"; secrets: SecretStatus[] }
  | { kind: "no_encryption_key" }
  | { kind: "bad_format" }
  | Failure;

/** 빈 문자열을 보내면 지운다. */
export async function saveSecret(
  config: Config,
  name: SecretStatus["name"],
  value: string,
): Promise<SaveSecretResult> {
  const response = await request(config, "/api/secrets", {
    method: "POST",
    body: JSON.stringify({ name, value }),
  });
  if (isFailure(response)) {
    // 400 은 request 가 unreachable 로 싸버리므로 코드를 되살린다.
    if (response.kind === "unreachable") {
      if (response.message.includes("no_encryption_key")) {
        return { kind: "no_encryption_key" };
      }
      if (response.message.includes("bad_format")) return { kind: "bad_format" };
    }
    return response;
  }
  const body = (await response.json()) as { secrets: SecretStatus[] };
  return { kind: "ok", secrets: body.secrets };
}

// ── 캘린더 ───────────────────────────────────────────────
// publishedKey 는 내려오지 않는다. 그 키를 아는 사람은 일정을 다 읽는다.

export type SubscriptionsResult = Result<{
  subscriptions: CalendarSubscription[];
  canStore: boolean;
}>;

export async function fetchSubscriptions(
  config: Config,
): Promise<SubscriptionsResult> {
  const response = await request(config, "/api/calendar/subscriptions");
  if (isFailure(response)) return response;
  const body = (await response.json()) as {
    subscriptions: CalendarSubscription[];
    canStore: boolean;
  };
  return {
    kind: "ok",
    subscriptions: body.subscriptions,
    canStore: body.canStore,
  };
}

export type AddSubscriptionResult =
  | { kind: "ok"; subscriptions: CalendarSubscription[] }
  | { kind: "rejected"; message: string }
  | Failure;

/**
 * 주소를 등록한다. 서버가 네이버에 한 번 물어보고 통과한 것만 저장한다 —
 * 그래서 여기서 돌아오는 실패는 대부분 사용자가 고칠 수 있는 것이다.
 */
export async function addSubscription(
  config: Config,
  url: string,
): Promise<AddSubscriptionResult> {
  const response = await request(config, "/api/calendar/subscriptions", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  if (isFailure(response)) {
    // 400 은 request 가 unreachable 로 싸버린다. 서버가 붙여 보낸 사유를 되살린다.
    if (response.kind === "unreachable") {
      return { kind: "rejected", message: response.message };
    }
    return response;
  }
  const body = (await response.json()) as {
    subscriptions: CalendarSubscription[];
  };
  return { kind: "ok", subscriptions: body.subscriptions };
}

/**
 * 체크박스. 끄는 것은 빼는 것과 달라서 주소가 서버에 남고, 다시 켜면 그대로 돌아온다.
 * DELETE 가 아니라 POST 를 쓰는 이유는 서버가 알리는 허용 메서드가
 * GET·POST·OPTIONS 뿐이기 때문이다.
 */
export async function toggleSubscription(
  config: Config,
  id: string,
  enabled: boolean,
): Promise<SubscriptionsResult> {
  const response = await request(config, "/api/calendar/subscriptions", {
    method: "POST",
    body: JSON.stringify({ id, enabled }),
  });
  if (isFailure(response)) return response;
  const body = (await response.json()) as {
    subscriptions: CalendarSubscription[];
  };
  return { kind: "ok", subscriptions: body.subscriptions, canStore: true };
}

export async function removeSubscription(
  config: Config,
  id: string,
): Promise<SubscriptionsResult> {
  const response = await request(
    config,
    `/api/calendar/subscriptions?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (isFailure(response)) return response;
  const body = (await response.json()) as {
    subscriptions: CalendarSubscription[];
  };
  return { kind: "ok", subscriptions: body.subscriptions, canStore: true };
}

/** 캘린더 하나가 실패해도 나머지는 온다. 그래서 events 와 failed 가 같이 온다. */
export type CalendarFailure = {
  label: string;
  kind: string;
  message: string;
};

export type CalendarEventsResult = Result<{
  /** 등록된 캘린더가 하나라도 있는지. 없으면 빈 화면의 이유가 다르다 */
  configured: boolean;
  /** 붙여는 뒀는데 체크를 다 꺼둔 상태. "연결 전" 과 구분해야 한다 */
  paused: boolean;
  /** 붙어 있는 캘린더 이름들. 그 기간에 일정이 없는 것도 들어 있다 */
  calendars: string[];
  events: CalendarEvent[];
  failed: CalendarFailure[];
}>;

export async function fetchCalendarEvents(
  config: Config,
  from: string,
  to: string,
): Promise<CalendarEventsResult> {
  const response = await request(
    config,
    `/api/calendar/events?from=${from}&to=${to}`,
  );
  if (isFailure(response)) return response;
  const body = (await response.json()) as {
    configured: boolean;
    paused?: boolean;
    calendars: string[];
    events: CalendarEvent[];
    failed: CalendarFailure[];
  };
  return {
    kind: "ok",
    configured: body.configured,
    // 서버가 아직 이 필드를 안 보내는 버전일 수 있다. 없으면 안 꺼둔 것으로 읽는다.
    paused: body.paused ?? false,
    calendars: body.calendars,
    events: body.events,
    failed: body.failed,
  };
}

/** Failure 를 사람 말로. 화면 여러 곳에서 같은 문장을 써야 한다. */
export function describeFailure(failure: Failure): string {
  return failure.kind === "unauthorized"
    ? "인증이 만료됐습니다. 연결을 다시 설정해 주세요."
    : `서버에 닿지 않습니다 (${failure.message})`;
}

/**
 * 문제 풀기 기록.
 *
 * ⚠ 이 셋만은 실패해도 화면을 막지 않는다. 문제 자체는 정적 파일이라 서버 없이도
 *   풀 수 있어서, 기록이 안 되는 것 때문에 문제집을 못 보게 되면 손해가 더 크다.
 *   부르는 쪽이 Failure 를 받아 조용히 안내만 띄운다.
 */
export type QuizSessionsResult = Result<{ sessions: QuizSessionSummary[] }>;
export type QuizSessionResult = Result<{ session: QuizSession }>;

export async function fetchQuizSessions(
  config: Config,
): Promise<QuizSessionsResult> {
  const response = await request(config, "/api/quiz/sessions");
  if (isFailure(response)) return response;
  const body = (await response.json()) as { sessions: QuizSessionSummary[] };
  return { kind: "ok", sessions: body.sessions };
}

export async function fetchQuizSession(
  config: Config,
  id: string,
): Promise<QuizSessionResult> {
  const response = await request(
    config,
    `/api/quiz/sessions/${encodeURIComponent(id)}`,
  );
  if (isFailure(response)) return response;
  const body = (await response.json()) as { session: QuizSession };
  return { kind: "ok", session: body.session };
}

/** 판 전체를 통째로 보낸다. 같은 id 면 서버가 덮어쓴다. */
export async function saveQuizSession(
  config: Config,
  session: QuizSession,
): Promise<QuizSessionResult> {
  const response = await request(config, "/api/quiz/sessions", {
    method: "POST",
    body: JSON.stringify({ session }),
  });
  if (isFailure(response)) return response;
  const body = (await response.json()) as { session: QuizSession };
  return { kind: "ok", session: body.session };
}
