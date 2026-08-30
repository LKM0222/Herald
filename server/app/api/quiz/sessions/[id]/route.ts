import { isAuthorized, json, preflight, unauthorized } from "@/lib/http";
import { findSession } from "@/lib/quiz/sessions";

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

/** 판 하나의 전체 내용. 어떤 문제였고 각각 맞았는지 틀렸는지가 여기 있다. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  const { id } = await params;
  const session = findSession(id);

  // 없는 판은 진짜로 없는 것이다 — 브리핑처럼 "아직 안 만들어진 날" 이 아니라
  // 목록에서 눌러 들어왔는데 사라진 상황이라 404 가 맞다.
  if (!session) return json({ error: "not_found" }, { status: 404, origin });

  return json({ session }, { origin });
}
