/**
 * 로그인 시도 횟수 제한.
 *
 * 사람이 외울 만한 비밀번호를 안전하게 만드는 건 해시가 아니라 이 제한이다.
 * scrypt 로 한 번의 시도를 비싸게 만들어도, 무한히 시도할 수 있으면 결국 뚫린다.
 *
 * 메모리에만 둔다 — 컨테이너를 재시작하면 초기화되지만, 재시작을 유발할 수 있는
 * 공격자라면 이미 다른 문제가 있는 것이다. 단일 인스턴스라 공유 저장소도 필요 없다.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    sweep(now);
    return { allowed: true, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** 로그인에 성공하면 카운터를 지운다. 정상 사용자가 스스로를 잠그지 않게. */
export function clearRateLimit(key: string): void {
  attempts.delete(key);
}

function sweep(now: number): void {
  if (attempts.size < 1000) return;
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}

/**
 * 요청자 식별자.
 *
 * 이 앱은 Caddy 뒤에만 있고 앱 포트는 인터넷에 열려 있지 않다 —
 * 그래서 X-Forwarded-For 를 신뢰할 수 있다. 앱을 직접 노출하면 이 전제가 깨진다.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
