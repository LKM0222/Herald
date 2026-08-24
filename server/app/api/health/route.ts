import { json, preflight } from "@/lib/http";

/**
 * 서버가 살아 있는지만 알려준다. 인증을 걸지 않는다 —
 * 클라이언트가 "API 주소가 틀렸나 / 토큰이 틀렸나"를 구분하려면
 * 토큰 없이도 닿는 지점이 하나 필요하다.
 */
export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

export async function GET(request: Request) {
  return json({ ok: true, service: "herald" }, {
    origin: request.headers.get("origin"),
  });
}
