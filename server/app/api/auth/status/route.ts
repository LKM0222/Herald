import { hasPassword } from "@/lib/auth";
import { json, preflight } from "@/lib/http";

/**
 * 인증 없이 열려 있다. 화면이 "비밀번호를 물을지, 복구 토큰을 물을지"를
 * 정하려면 로그인 전에 알아야 한다.
 *
 * 비밀번호 설정 여부는 그 자체로 비밀이 아니다 — 서버가 존재한다는 사실은
 * 주소만 알면 어차피 드러난다.
 */
export async function GET(request: Request) {
  return json(
    { hasPassword: hasPassword() },
    { origin: request.headers.get("origin") },
  );
}

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}
