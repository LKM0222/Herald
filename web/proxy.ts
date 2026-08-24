import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";

/**
 * Next 16 의 요청 가로채기 규약. (15까지의 middleware.ts 가 이 이름으로 바뀌었다)
 *
 * auth() 로 감싼 핸들러 안에서는 req.auth 로 세션을 볼 수 있다.
 * 미로그인 요청은 전부 /login 으로 돌린다 — 페이지마다 검사를 되풀이하지 않기 위해 한곳에 둔다.
 */
const gate = auth((req) => {
  // 로그인 화면 자체는 열려 있어야 한다. 아니면 무한 리다이렉트가 된다.
  if (req.nextUrl.pathname.startsWith("/login")) return NextResponse.next();

  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
});

/**
 * auth() 의 반환 타입은 라우트 핸들러 시그니처(두 번째 인자가 params)로 좁혀지지만,
 * 실제 구현은 미들웨어 시그니처(req, event)로도 호출되도록 만들어져 있다.
 * 그 간극만 여기서 좁힌다.
 */
type ProxyFn = (
  request: NextRequest,
  event: NextFetchEvent,
) => Response | Promise<Response | undefined> | undefined;

// Next 는 이 파일에서 "함수 선언"을 찾는다. 재export(export { x as default })는 인식하지 못한다.
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return (gate as unknown as ProxyFn)(request, event);
}

export const config = {
  // 인증 엔드포인트와 정적 자산은 게이트에서 제외한다.
  // 여기를 막으면 로그인 왕복 자체가 불가능해진다.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
