import { useEffect, useState } from "react";
import { CATALOG } from "@shared/sources";
import { Card } from "../components/Card";
import {
  fetchSettings,
  saveSettings,
  setPassword,
  type Failure,
} from "../lib/api";
import { saveConfig, type Config } from "../lib/config";

export function Settings({
  config,
  onReconnect,
  onConfigChanged,
}: {
  config: Config;
  onReconnect: () => void;
  onConfigChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SourcesCard config={config} />
      <PasswordCard config={config} onConfigChanged={onConfigChanged} />
      <ConnectionCard config={config} onReconnect={onReconnect} />
    </div>
  );
}

/** 어느 매체를 모을지. 저장은 서버에 하고, 기기가 바뀌어도 따라간다. */
function SourcesCard({ config }: { config: Config }) {
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSettings(config).then((result) => {
      if (cancelled) return;
      if (result.kind === "ok") setEnabled(result.enabledSources);
      else setError(describe(result));
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  async function toggle(id: string) {
    if (!enabled) return;
    const next = enabled.includes(id)
      ? enabled.filter((value) => value !== id)
      : [...enabled, id];

    // 낙관적으로 먼저 반영한다 — 체크박스가 늦게 움직이면 안 눌린 줄 안다.
    setEnabled(next);
    setSaving(true);
    const result = await saveSettings(config, next);
    setSaving(false);
    if (result.kind === "ok") {
      setEnabled(result.enabledSources);
      setError(null);
    } else {
      setEnabled(enabled); // 되돌린다
      setError(describe(result));
    }
  }

  return (
    <Card title="📰 뉴스 소스" meta={saving ? "저장 중…" : undefined}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {enabled === null && !error ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : (
        <ul className="flex flex-col">
          {CATALOG.map((source) => {
            const on = enabled?.includes(source.id) ?? false;
            return (
              <li key={source.id} className="border-b border-border last:border-0">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => void toggle(source.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">{source.name}</span>
                      {"noisy" in source && source.noisy ? (
                        <span className="text-[10px] text-muted">양 많음</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted">
                      {source.note}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Anthropic 은 공식 RSS 가 없어 목록에 없습니다. 수집은 아직 붙지 않아
        지금은 선택만 저장됩니다.
      </p>
    </Card>
  );
}

/** 비밀번호 설정·변경. 이걸 설정해야 다른 기기에서 긴 토큰 없이 들어온다. */
function PasswordCard({
  config,
  onConfigChanged,
}: {
  config: Config;
  onConfigChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "done" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  const mismatch = confirm !== "" && value !== confirm;
  const ready = value.length >= 8 && value === confirm && !busy;

  async function submit() {
    setBusy(true);
    const result = await setPassword(config, value);
    setBusy(false);
    if (result.kind === "ok") {
      setValue("");
      setConfirm("");
      // 서버가 새 세션 토큰을 함께 준다. 이 기기도 복구용 토큰을 놓고 갈아탄다.
      if (result.token) {
        saveConfig({ apiBase: config.apiBase, token: result.token });
        onConfigChanged();
      }
      setState({ kind: "done" });
    } else if (result.kind === "too_short") {
      setState({ kind: "error", message: `${result.minLength}자 이상이어야 합니다.` });
    } else {
      setState({ kind: "error", message: describe(result) });
    }
  }

  return (
    <Card title="🔑 비밀번호">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void submit();
        }}
      >
        <p className="text-xs leading-relaxed text-muted">
          설정해두면 새 기기에서 긴 토큰 대신 이 비밀번호로 들어올 수 있습니다.
          서버에는 해시로만 저장되고, 로그인 시도 횟수가 제한됩니다.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">새 비밀번호 (8자 이상)</span>
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="new-password"
            className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">한 번 더</span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
          />
        </label>

        {mismatch ? <Notice tone="error">두 값이 다릅니다.</Notice> : null}
        {state.kind === "error" ? (
          <Notice tone="error">{state.message}</Notice>
        ) : null}
        {state.kind === "done" ? (
          <Notice tone="ok">
            저장했습니다. 이제 폰이든 다른 PC 든 <b>같은 비밀번호</b>로 들어올 수
            있습니다.
          </Notice>
        ) : null}

        <button
          type="submit"
          disabled={!ready}
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "저장 중…" : "비밀번호 저장"}
        </button>
      </form>
    </Card>
  );
}

function ConnectionCard({
  config,
  onReconnect,
}: {
  config: Config;
  onReconnect: () => void;
}) {
  return (
    <Card title="🔌 연결">
      <div className="flex flex-col items-start gap-3">
        <p className="break-all text-sm">{config.apiBase}</p>
        <p className="text-xs text-muted">
          접속 정보는 이 브라우저에만 저장됩니다.
        </p>
        <button
          type="button"
          onClick={onReconnect}
          className="min-h-11 rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
        >
          연결 다시 설정
        </button>
      </div>
    </Card>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        tone === "error"
          ? "border-accent/40 text-accent"
          : "border-border text-muted"
      }`}
    >
      {children}
    </p>
  );
}

function describe(failure: Failure): string {
  return failure.kind === "unauthorized"
    ? "인증이 만료됐습니다. 연결을 다시 설정해 주세요."
    : `서버에 닿지 않습니다 (${failure.message})`;
}
