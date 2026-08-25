import {
  isAuthorized,
  json,
  preflight,
  storageError,
  unauthorized,
} from "@/lib/http";
import {
  add,
  hasEncryptionKey,
  list,
  remove,
} from "@/lib/calendar/subscriptions";
import {
  fetchInfo,
  NaverPublicError,
  resolveKey,
} from "@/lib/calendar/naver-public";

/**
 * 등록해 둔 캘린더 주소 관리.
 *
 * 넣을 때 **네이버에 한 번 물어본다.** 주소만 받아 저장해두면 오타나
 * 공유 해제를 일정 탭이 빌 때까지 모른다 — "일정이 없는 것"과
 * "주소가 틀린 것"이 화면에서 똑같이 보이는 게 제일 나쁜 실패다.
 */
export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);
  return json(
    { subscriptions: list(), canStore: hasEncryptionKey() },
    { origin },
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  let url = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url === "string") url = body.url;
  } catch {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }
  if (url.trim() === "") {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }

  try {
    const key = await resolveKey(url);
    const info = await fetchInfo(key);

    const result = add({ key, label: info.name, owner: info.owner });
    if (!result.ok) {
      return json({ error: result.error }, { status: 400, origin });
    }
    return json({ subscriptions: result.subscriptions }, { origin });
  } catch (error) {
    if (error instanceof NaverPublicError) {
      // 사용자가 고칠 수 있는 실패다. 사유를 그대로 올린다.
      return json(
        { error: error.kind, message: error.message },
        { status: 400, origin },
      );
    }
    return storageError(origin, error);
  }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "invalid_body" }, { status: 400, origin });

  try {
    return json({ subscriptions: remove(id) }, { origin });
  } catch (error) {
    return storageError(origin, error);
  }
}
