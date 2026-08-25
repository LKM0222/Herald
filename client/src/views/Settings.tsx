import { useEffect, useState, type ReactNode } from "react";
import { CATALOG } from "@shared/sources";
import { KeyRound, Palette, Plug, Rss } from "lucide-react";
import {
  fetchSettings,
  saveSettings,
  setPassword,
  type Failure,
} from "../lib/api";
import { saveConfig, type Config } from "../lib/config";
import {
  applyPalette,
  loadPalette,
  PALETTES,
  savePalette,
  type PaletteId,
} from "../lib/palette";
import { Button, Field, inputClass, Kicker, Tag } from "../components/ui";

/**
 * 설정은 네 구획이다. 좁은 화면에선 그냥 쌓이고,
 * 넓은 화면에서만 왼쪽에 목차가 붙는다 — 목차가 세로로 길어질 만큼 항목이 많지 않다.
 */
const SECTIONS = [
  { id: "appearance", label: "겉모습", Icon: Palette },
  { id: "sources", label: "뉴스 소스", Icon: Rss },
  { id: "password", label: "비밀번호", Icon: KeyRound },
  { id: "connection", label: "연결", Icon: Plug },
] as const;

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
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <nav className="hidden w-40 shrink-0 flex-col gap-0.5 lg:flex">
        <span className="mb-2 px-3">
          <Kicker>설정</Kicker>
        </span>
        {SECTIONS.map(({ id, label, Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm hover:bg-fg/[0.05]"
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <AppearanceSection />
        <SourcesSection config={config} />
        <PasswordSection config={config} onConfigChanged={onConfigChanged} />
        <ConnectionSection config={config} onReconnect={onReconnect} />
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  note,
  aside,
  children,
}: {
  id: string;
  title: string;
  note: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-display text-xl">{title}</h3>
          <span className="text-xs leading-relaxed text-dim">{note}</span>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** 색조를 고른다. 밝기(라이트·다크)는 헤더에 있고 여기선 색만 다룬다. */
function AppearanceSection() {
  const [palette, setPalette] = useState<PaletteId>(loadPalette);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  return (
    <Section
      id="appearance"
      title="겉모습"
      note="고른 팔레트는 이 브라우저에 저장돼요. 밝기는 헤더에서 바꾸고, 시스템에 맡기면 OS 설정을 따라갑니다."
    >
      <div className="flex flex-col gap-2">
        <Kicker>색상 팔레트</Kicker>
        {PALETTES.map((option) => {
          const selected = option.id === palette;
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3.5 ${
                selected ? "border-accent bg-accent-soft" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="palette"
                checked={selected}
                onChange={() => {
                  setPalette(option.id);
                  savePalette(option.id);
                }}
                className="size-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{option.name}</span>
                <span className="text-xs leading-snug text-dim">
                  {option.note}
                </span>
              </span>
              <span className="hidden shrink-0 gap-1 sm:flex">
                {option.swatch.map((color) => (
                  <span
                    key={color}
                    style={{ background: color }}
                    className="size-5 rounded-md border border-black/10"
                  />
                ))}
              </span>
              {selected ? <Tag tone="accent">쓰는 중</Tag> : null}
            </label>
          );
        })}
      </div>
    </Section>
  );
}

/** 어느 매체를 모을지. 저장은 서버에 하고, 기기가 바뀌어도 따라간다. */
function SourcesSection({ config }: { config: Config }) {
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

  const count = enabled?.length ?? 0;

  return (
    <Section
      id="sources"
      title="뉴스 소스"
      note={`${CATALOG.length}곳 중 ${count}곳 사용 중 · 서버에 저장되어 기기가 바뀌어도 따라갑니다`}
      aside={<Tag>{saving ? "저장 중…" : "수집 준비 중"}</Tag>}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}

      {enabled === null && !error ? (
        <p className="text-sm text-dim">불러오는 중…</p>
      ) : (
        <ul className="flex flex-col border-t border-line">
          {CATALOG.map((source) => {
            const on = enabled?.includes(source.id) ?? false;
            return (
              <li key={source.id} className="border-b border-line">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => void toggle(source.id)}
                    className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{source.name}</span>
                      {"noisy" in source && source.noisy ? (
                        <Tag>양 많음</Tag>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-dim">
                      {source.note}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-dim">
        Anthropic 은 공식 RSS 가 없어 목록에 없습니다. 수집은 아직 붙지 않아
        지금은 선택만 저장됩니다.
      </p>
    </Section>
  );
}

/** 비밀번호 설정·변경. 이걸 설정해야 다른 기기에서 긴 토큰 없이 들어온다. */
function PasswordSection({
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
      setState({
        kind: "error",
        message: `${result.minLength}자 이상이어야 합니다.`,
      });
    } else {
      setState({ kind: "error", message: describe(result) });
    }
  }

  return (
    <Section
      id="password"
      title="비밀번호"
      note="설정해두면 새 기기에서 긴 토큰 대신 이 비밀번호로 들어올 수 있습니다. 서버에는 해시로만 저장되고, 로그인 시도 횟수가 제한됩니다."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="새 비밀번호 (8자 이상)">
            <input
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <Field label="한 번 더">
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        </div>

        {mismatch ? <Notice tone="error">두 값이 다릅니다.</Notice> : null}
        {state.kind === "error" ? (
          <Notice tone="error">{state.message}</Notice>
        ) : null}
        {state.kind === "done" ? (
          <Notice tone="ok">
            저장했습니다. 이제 폰이든 다른 PC 든 같은 비밀번호로 들어올 수
            있습니다.
          </Notice>
        ) : null}

        <div>
          <Button type="submit" variant="primary" disabled={!ready}>
            {busy ? "저장 중…" : "비밀번호 저장"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function ConnectionSection({
  config,
  onReconnect,
}: {
  config: Config;
  onReconnect: () => void;
}) {
  return (
    <Section
      id="connection"
      title="연결"
      note="접속 정보는 이 브라우저에만 저장됩니다."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="break-all font-display text-sm">{config.apiBase}</span>
        <Button onClick={onReconnect}>연결 다시 설정</Button>
      </div>
    </Section>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: ReactNode;
}) {
  return (
    <p
      className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
        tone === "error"
          ? "border-accent text-accent"
          : "border-line text-dim"
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
