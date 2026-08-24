import { useEffect, useState } from "react";
import { Logo } from "./components/Logo";
import { ThemeToggle } from "./components/ThemeToggle";
import { fetchAuthStatus, login } from "./lib/api";
import { defaultApiBase, saveConfig, type Config } from "./lib/config";

/**
 * 서버에 연결한다.
 *
 * 평소 경로는 **비밀번호**다 — 서버가 확인하고 긴 토큰을 발급해주면
 * 그걸 브라우저에 저장한다. 사람이 긴 문자열을 외울 이유가 없다.
 *
 * 토큰 직접 입력은 복구용으로 남긴다. 비밀번호를 아직 안 정했거나
 * 잊었을 때 .env 의 API_TOKEN 으로 들어오는 길이다.
 */
type Mode = "password" | "token";

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
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<Mode>("password");
  const [manualMode, setManualMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 서버에 비밀번호가 설정돼 있는지 보고 물어볼 것을 정한다.
  // 사용자가 직접 골랐으면(manualMode) 그 선택을 덮지 않는다.
  useEffect(() => {
    const target = apiBase.trim().replace(/\/$/, "");
    if (!target || manualMode) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchAuthStatus(target).then((status) => {
        if (cancelled || !status) return;
        setMode(status.hasPassword ? "password" : "token");
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiBase, manualMode]);

  const ready = apiBase.trim() !== "" && secret.trim() !== "" && !busy;

  async function submit() {
    const target = apiBase.trim().replace(/\/$/, "");
    setBusy(true);
    setError(null);

    if (mode === "token") {
      // 토큰은 그대로 저장한다. 맞는지는 첫 요청에서 드러난다.
      saveConfig({ apiBase: target, token: secret });
      setBusy(false);
      onSaved();
      return;
    }

    const result = await login(target, secret);
    setBusy(false);

    if (result.kind === "ok") {
      saveConfig({ apiBase: target, token: result.token });
      onSaved();
      return;
    }
    setError(
      result.kind === "wrong"
        ? "비밀번호가 맞지 않습니다."
        : result.kind === "throttled"
          ? `시도가 너무 많습니다. ${result.retryAfter}초 뒤에 다시 해주세요.`
          : `서버에 닿지 않습니다 (${result.message})`,
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <form
        className="flex w-full max-w-sm flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void submit();
        }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo variant="lockup" className="h-28 w-auto" />
          <h1 className="sr-only">Herald</h1>
          <p className="text-sm text-muted">
            {mode === "password"
              ? "비밀번호를 입력해 주세요."
              : "브리핑을 가져올 서버를 알려주세요."}
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
          <span className="text-xs text-muted">
            {mode === "password" ? "비밀번호" : "API 토큰"}
          </span>
          <input
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            type="password"
            autoComplete={mode === "password" ? "current-password" : "off"}
            autoFocus={apiBase.trim() !== ""}
            className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-accent/40 px-3 py-2 text-xs leading-relaxed text-accent">
            {error}
          </p>
        ) : null}

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
            {busy ? "확인 중…" : "연결"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setManualMode(true);
            setMode(mode === "password" ? "token" : "password");
            setSecret("");
            setError(null);
          }}
          className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
        >
          {mode === "password"
            ? "비밀번호 대신 API 토큰으로 연결"
            : "비밀번호로 연결"}
        </button>

        <p className="text-xs leading-relaxed text-muted">
          이 브라우저에만 저장됩니다. 비밀번호는 연결할 때 한 번만 쓰이고,
          이후에는 서버가 발급한 토큰으로 통신합니다.
        </p>

        {/* 아직 연결 전이라도 테마는 고를 수 있어야 한다 */}
        <div className="flex justify-center">
          <ThemeToggle />
        </div>
      </form>
    </main>
  );
}
