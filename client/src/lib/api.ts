import type { Briefing, SecretStatus } from "@shared/types";
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
export type SettingsResult = Result<{ enabledSources: string[] }>;

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
  try {
    const body = (await response.json()) as { error?: string };
    code = body.error ?? "";
  } catch {
    // 본문이 JSON 이 아니면 상태 코드만으로 말한다.
  }
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

export async function fetchSettings(config: Config): Promise<SettingsResult> {
  const response = await request(config, "/api/settings");
  if (isFailure(response)) return response;
  const body = (await response.json()) as {
    settings: { enabledSources: string[] };
  };
  return { kind: "ok", enabledSources: body.settings.enabledSources };
}

export async function saveSettings(
  config: Config,
  enabledSources: string[],
): Promise<SettingsResult> {
  const response = await request(config, "/api/settings", {
    method: "POST",
    body: JSON.stringify({ enabledSources }),
  });
  if (isFailure(response)) return response;
  const body = (await response.json()) as {
    settings: { enabledSources: string[] };
  };
  return { kind: "ok", enabledSources: body.settings.enabledSources };
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
