import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  applyTheme,
  loadTheme,
  saveTheme,
  watchSystemTheme,
  type Theme,
} from "../lib/theme";

const OPTIONS = [
  { id: "light", label: "라이트", Icon: Sun },
  { id: "dark", label: "다크", Icon: Moon },
  { id: "system", label: "시스템", Icon: Monitor },
] as const satisfies readonly { id: Theme; label: string; Icon: unknown }[];

/**
 * 상태를 자기 안에 들고 있다. 실제 반영은 DOM 속성이라
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
      aria-label="화면 밝기"
      className="flex shrink-0 overflow-hidden rounded-full border border-line"
    >
      {OPTIONS.map(({ id, label, Icon }, index) => {
        const selected = theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => {
              setTheme(id);
              saveTheme(id);
            }}
            className={`flex h-10 w-11 items-center justify-center transition-colors ${
              index > 0 ? "border-l border-line" : ""
            } ${
              selected
                ? "bg-accent text-bg"
                : "text-dim hover:bg-fg/[0.07] hover:text-fg"
            }`}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
