/**
 * API 주소와 토큰은 빌드에 박지 않고 브라우저에 저장한다.
 *
 * GitHub Pages 는 공개라 번들에 토큰을 넣으면 누구나 꺼내 쓸 수 있고,
 * 서버 주소가 바뀔 때마다 다시 빌드하는 것도 번거롭다.
 */
const STORAGE_KEY = "herald.config";

export type Config = {
  /** 예: https://herald.example.com (끝에 / 없이) */
  apiBase: string;
  token: string;
};

/**
 * 설정 화면의 서버 주소 칸을 미리 채운다.
 *
 * 주소는 번들에 박아도 된다 — DNS 로 조회되고 HTTPS 인증서가 CT 로그에
 * 공개로 남으므로 애초에 숨길 수 있는 값이 아니다.
 * ⛔ 토큰은 절대 여기 오면 안 된다. Pages 번들은 누구나 내려받아 읽는다.
 */
export const defaultApiBase =
  import.meta.env.VITE_API_BASE ?? "https://lkm0222.duckdns.org";

export function loadConfig(): Config | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Config>;
    if (!parsed.apiBase || !parsed.token) return null;
    return { apiBase: parsed.apiBase, token: parsed.token };
  } catch {
    // 시크릿 창·저장소 차단 등에서 접근 자체가 예외를 던진다.
    return null;
  }
}

export function saveConfig(config: Config): void {
  const normalized: Config = {
    apiBase: config.apiBase.trim().replace(/\/$/, ""),
    token: config.token.trim(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // 저장이 막혀도 이번 세션은 굴러가야 하므로 조용히 넘어간다.
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 위와 같음 */
  }
}
