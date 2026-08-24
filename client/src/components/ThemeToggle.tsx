import { useEffect, useState } from "react";
import {
  applyTheme,
  loadTheme,
  saveTheme,
  THEME_OPTIONS,
  watchSystemTheme,
  type Theme,
} from "../lib/theme";

/**
 * 상태를 자기 안에 들고 있다.
 * 이 컴포넌트는 Setup 화면과 AppShell 헤더 중 한 곳에만 나타나고
 * (둘은 동시에 렌더되지 않는다) 실제 반영은 DOM 속성이라,
 * 최상단까지 끌어올려 내려꽂을 이유가 없다.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
    // 시스템을 따를 때만 OS 설정 변화를 쫓아간다.
    if (theme !== "system") return;
    return watchSystemTheme(() => applyTheme("system"));
  }, [theme]);

  return (
    <div
      role="radiogroup"
      aria-label="화면 테마"
      className="flex shrink-0 rounded-lg border border-border p-0.5"
    >
      {THEME_OPTIONS.map((option) => {
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => {
              setTheme(option.id);
              saveTheme(option.id);
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-md text-sm transition-colors ${
              selected
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span aria-hidden="true">{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
