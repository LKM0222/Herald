import {
  isAuthorized,
  json,
  preflight,
  storageError,
  unauthorized,
} from "@/lib/http";
import {
  allStatuses,
  clearSecret,
  hasEncryptionKey,
  setSecret,
  type SecretName,
} from "@/lib/secrets";

const NAMES: SecretName[] = ["anthropic"];

/**
 * 저장된 값은 절대 돌려주지 않는다. 설정 여부와 끝 네 자리만 준다 —
 * 확인용으로 전체를 보여주면 화면을 띄운 사람 아무나 키를 가져간다.
 */
export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);
  return json(
    { secrets: allStatuses(), canStore: hasEncryptionKey() },
    { origin },
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  let name = "";
  let value: string | null = null;
  try {
    const body = (await request.json()) as { name?: unknown; value?: unknown };
    if (typeof body.name === "string") name = body.name;
    // value 가 빈 문자열이면 "지우기"다. null 과 구분한다.
    if (typeof body.value === "string") value = body.value;
  } catch {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }

  if (!NAMES.includes(name as SecretName)) {
    return json({ error: "unknown_secret" }, { status: 400, origin });
  }
  if (value === null) {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }

  try {
    if (value.trim() === "") {
      clearSecret(name as SecretName);
      return json({ secrets: allStatuses() }, { origin });
    }

    const result = setSecret(name as SecretName, value);
    if (!result.ok) {
      return json({ error: result.error }, { status: 400, origin });
    }
    return json({ secrets: allStatuses() }, { origin });
  } catch (error) {
    return storageError(origin, error);
  }
}

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}
