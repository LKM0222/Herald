/**
 * 화면 테마 — 라이트 · 다크 · 시스템.
 *
 * 세 값 중 하나를 저장하지만, DOM 에는 항상 `light` 아니면 `dark` 만 쓴다.
 * `system` 을 CSS 에서 풀면 미디어쿼리와 명시적 선택이 겹쳐서
 * 다크 팔레트를 두 벌 적어야 하고, 둘이 조용히 어긋난다.
 * 그래서 해석은 여기서 하고 CSS 에는 결론만 넘긴다.
 */
const STORAGE_KEY = "herald.theme";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

export const THEME_OPTIONS = [
  { id: "light", icon: "☀", label: "라이트" },
  { id: "dark", icon: "☾", label: "다크" },
  { id: "system", icon: "🖥", label: "시스템" },
] as const satisfies readonly { id: Theme; icon: string; label: string }[];

/** 기본값은 시스템. 아무 설정도 안 한 사람에게 OS 설정을 따르게 한다. */
export const DEFAULT_THEME: Theme = "system";

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // 시크릿 창·저장소 차단에서는 접근 자체가 예외를 던진다.
  }
  return DEFAULT_THEME;
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장이 막혀도 이번 세션은 굴러가야 한다.
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function applyTheme(theme: Theme): void {
  const resolved: Resolved =
    theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  // 스크롤바·기본 폼 컨트롤까지 같이 따라오게 한다.
  root.style.colorScheme = resolved;
}

/**
 * OS 테마 변경 구독. `system` 일 때만 의미가 있다.
 * 해제 함수를 돌려준다.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * OS 설정을 따라가는 일을 **앱 전체가** 맡는다 (main.tsx 에서 한 번 부른다).
 *
 * 예전엔 밝기 버튼이 머리줄에 늘 떠 있어서 그 컴포넌트가 구독을 들고 있었다.
 * 버튼이 설정 화면 안으로 들어가면서 그 자리가 없어졌다 — 그대로 두면
 * 홈·뉴스를 보는 동안 OS 가 다크로 바뀌어도 화면이 안 따라온다.
 *
 * `index.html` 의 인라인 스크립트는 **첫 페인트 한 번**을 맡는다. 여기는
 * 그 뒤로 계속 따라가는 몫이라 서로 자리가 다르다 — 규칙(three→two 로 푸는 법)은
 * 여전히 applyTheme 한 곳에만 적혀 있다.
 */
export function startThemeSync(): () => void {
  applyTheme(loadTheme());
  return watchSystemTheme(() => {
    // 그때그때 저장된 값을 다시 읽는다 — 설정 화면에서 바뀌어 있을 수 있다.
    if (loadTheme() === "system") applyTheme("system");
  });
}
