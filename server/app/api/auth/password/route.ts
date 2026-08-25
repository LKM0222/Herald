import { issueToken, setPassword } from "@/lib/auth";
import {
  isAuthorized,
  json,
  preflight,
  storageError,
  unauthorized,
} from "@/lib/http";

/** 너무 짧으면 횟수 제한만으로는 못 버틴다. */
const MIN_LENGTH = 8;

/**
 * 비밀번호 설정·변경.
 *
 * 인증이 필요하다 — 세션 토큰이든 .env 의 API_TOKEN 이든.
 * 처음 설정할 때는 아직 비밀번호가 없으므로 API_TOKEN 이 부트스트랩 역할을 한다.
 * 이 경로가 열려 있으면 아무나 서버를 가로챌 수 있다.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    // 아래 길이 검사에서 걸린다.
  }

  if (password.length < MIN_LENGTH) {
    return json(
      { error: "too_short", minLength: MIN_LENGTH },
      { status: 400, origin },
    );
  }

  try {
    setPassword(password);
  } catch (error) {
    return storageError(origin, error);
  }

  // 방금 비밀번호를 정한 기기도 세션 토큰으로 갈아탄다.
  // 복구용 API_TOKEN 을 계속 들고 있을 이유가 없다.
  return json({ ok: true, token: issueToken() }, { origin });
}

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}
