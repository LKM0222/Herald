import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyToken } from "./auth";

/**
 * 이 서버는 JSON만 내어준다. 화면은 GitHub Pages(그리고 나중에 크롬 확장)에 따로 있고,
 * 그쪽은 다른 오리진이라 CORS 와 토큰 인증이 필요하다.
 */

function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * 허용 목록에 있는 오리진일 때만 CORS 헤더를 붙인다.
 * 목록이 비어 있으면 아무 헤더도 안 붙어서 브라우저가 막는다 — 설정 누락이 개방이 되면 안 된다.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  const normalized = origin.replace(/\/$/, "");
  if (!allowedOrigins().includes(normalized)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    // 오리진마다 응답이 다르므로 캐시가 섞이지 않게 한다.
    Vary: "Origin",
  };
}

/** 길이가 달라도 조기 반환하지 않도록 해시 대신 고정 길이 비교를 쓴다. */
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Authorization: Bearer <값> 을 확인한다. 받아주는 값은 두 가지다.
 *
 * 1. 비밀번호 로그인으로 발급된 세션 토큰 — 평소 경로
 * 2. .env 의 API_TOKEN — 비밀번호를 잊었을 때의 복구 경로이자
 *    비밀번호를 처음 설정할 때의 부트스트랩
 *
 * 둘 다 설정돼 있지 않으면 전부 거부한다(fail-closed).
 */
export function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  if (verifyToken(token)) return true;

  const recovery = process.env.API_TOKEN ?? "";
  return recovery !== "" && safeEquals(token, recovery);
}

export function json(
  body: unknown,
  init: { status?: number; origin: string | null },
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: corsHeaders(init.origin),
  });
}

/** 프리플라이트 응답. 본문 없이 헤더만 준다. */
export function preflight(origin: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * 저장 실패. 대개 원인은 하나다 — 데이터 볼륨이 앱 사용자(uid 1001)에게
 * 쓰기 권한이 없다. 맨 500 으로 두면 화면에서 원인을 알 길이 없다.
 */
export function storageError(
  origin: string | null,
  error: unknown,
): NextResponse {
  const detail = error instanceof Error ? error.message : String(error);
  console.error("[herald] 저장 실패:", detail);
  return json({ error: "storage_unwritable", detail }, { status: 500, origin });
}

export function unauthorized(origin: string | null): NextResponse {
  return json({ error: "unauthorized" }, { status: 401, origin });
}
