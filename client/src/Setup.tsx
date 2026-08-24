import { useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { defaultApiBase, saveConfig, type Config } from "./lib/config";

/**
 * 서버 주소와 토큰을 받아 브라우저에 저장한다.
 * 빌드에 박지 않는 이유는 config.ts 주석 참고.
 */
export function Setup({
  current,
  onSaved,
  onCancel,
}: {
  current: Config | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [apiBase, setApiBase] = useState(current?.apiBase ?? defaultApiBase);
  const [token, setToken] = useState(current?.token ?? "");

  const ready = apiBase.trim() !== "" && token.trim() !== "";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <form
        className="flex w-full max-w-sm flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          saveConfig({ apiBase, token });
          onSaved();
        }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-4xl leading-none">🐓</span>
          <h1 className="text-xl font-semibold tracking-tight">Herald</h1>
          <p className="text-sm text-muted">
            브리핑을 가져올 서버를 알려주세요.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">서버 주소</span>
          <input
            value={apiBase}
            onChange={(event) => setApiBase(event.target.value)}
            placeholder="https://herald.example.com"
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">API 토큰</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            autoFocus={apiBase.trim() !== ""}
            autoComplete="off"
            className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
          />
        </label>

        <div className="flex gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 flex-1 rounded-lg border border-border text-sm text-muted"
            >
              취소
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!ready}
            className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            연결
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          이 브라우저에만 저장됩니다. 서버로 전송되는 건 요청할 때뿐이고,
          빌드된 파일에는 들어가지 않습니다.
        </p>

        {/* 아직 연결 전이라도 테마는 고를 수 있어야 한다 —
            눈이 부신 채로 토큰을 입력하게 만들 이유가 없다 */}
        <div className="flex justify-center">
          <ThemeToggle />
        </div>
      </form>
    </main>
  );
}
