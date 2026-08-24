import type { Briefing } from "@shared/types";
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
      return { kind: "unreachable", message: `서버 응답 ${response.status}` };
    }
    return response;
  } catch (error) {
    return {
      kind: "unreachable",
      message: error instanceof Error ? error.message : "연결 실패",
    };
  }
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
  | { kind: "ok" }
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
    if (response.kind === "unreachable" && response.message.includes("400")) {
      return { kind: "too_short", minLength: 8 };
    }
    return response;
  }
  return { kind: "ok" };
}
