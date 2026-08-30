import {
  isAuthorized,
  json,
  preflight,
  storageError,
  unauthorized,
} from "@/lib/http";
import { cleanSession, listSummaries, saveSession } from "@/lib/quiz/sessions";

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

/** 목록. 요약만 준다 — 판마다 문제 수십 개를 실어 보내면 목록이 무거워진다. */
export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);
  return json({ sessions: listSummaries() }, { origin });
}

/**
 * 판 하나를 통째로 저장한다. 같은 id 면 덮어쓴다 —
 * 화면이 한 문제 채점할 때마다 이걸 부른다.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }

  const session = cleanSession((body as { session?: unknown })?.session);
  if (!session) {
    return json({ error: "invalid_session" }, { status: 400, origin });
  }

  try {
    return json({ session: saveSession(session) }, { origin });
  } catch (error) {
    return storageError(origin, error);
  }
}
