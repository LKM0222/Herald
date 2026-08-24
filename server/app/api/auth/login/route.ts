import { issueToken, verifyPassword } from "@/lib/auth";
import { json, preflight } from "@/lib/http";
import { checkRateLimit, clearRateLimit } from "@/lib/rateLimit";

/**
 * 비밀번호 → 세션 토큰.
 *
 * 사람이 외울 만한 비밀번호를 안전하게 만드는 건 해시가 아니라 횟수 제한이다.
 * 그래서 이 라우트만이 비밀번호를 받고, 여기에만 제한을 건다.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const key = clientKeyOf(request);

  const limit = checkRateLimit(key);
  if (!limit.allowed) {
    return json(
      { error: "too_many_attempts", retryAfter: limit.retryAfter },
      { status: 429, origin },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    // 본문이 JSON 이 아니면 빈 비밀번호로 취급한다 — 아래에서 401 이 된다.
  }

  if (!password || !verifyPassword(password)) {
    // 비밀번호가 틀렸는지, 아직 설정되지 않았는지 구분해주지 않는다.
    return json({ error: "invalid_password" }, { status: 401, origin });
  }

  clearRateLimit(key);
  const token = issueToken();
  if (!token) return json({ error: "invalid_password" }, { status: 401, origin });

  return json({ token }, { origin });
}

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

// rateLimit 의 clientKey 를 그대로 쓴다. 여기 두는 건 import 이름 충돌을 피하기 위함.
function clientKeyOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
