import { useEffect, useState, type ReactNode } from "react";
import { CATALOG } from "@shared/sources";
import {
  CalendarDays,
  CalendarX,
  KeyRound,
  Link2,
  Palette,
  Plug,
  Rss,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  addSubscription,
  describeFailure as describe,
  fetchSecrets,
  fetchSettings,
  fetchSubscriptions,
  removeSubscription,
  saveSecret,
  saveSettings,
  setPassword,
  toggleSubscription,
  type SaveSecretResult,
} from "../lib/api";
import type { CalendarSubscription, SecretStatus } from "@shared/types";
import { saveConfig, type Config } from "../lib/config";
import {
  applyPalette,
  loadPalette,
  PALETTES,
  savePalette,
  type PaletteId,
} from "../lib/palette";
import {
  Button,
  Field,
  inputClass,
  Kicker,
  PendingButton,
  SCROLL_PANE,
  Tag,
} from "../components/ui";

/**
 * 설정은 네 구획이다. 좁은 화면에선 그냥 쌓이고,
 * 넓은 화면에서만 왼쪽에 목차가 붙는다 — 목차가 세로로 길어질 만큼 항목이 많지 않다.
 */
const SECTIONS = [
  { id: "appearance", label: "겉모습", Icon: Palette },
  { id: "sources", label: "뉴스 소스", Icon: Rss },
  { id: "summary", label: "요약 API", Icon: Sparkles },
  { id: "calendar", label: "캘린더", Icon: CalendarDays },
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
    // lg:min-h-0 — Home·ScheduleView 와 같은 이유. 서브내비·본문을
    // AppShell <main> 의 실제 높이에 맞춰야 아래 SCROLL_PANE 이 동작한다.
    <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-row lg:gap-10">
      {/* 4B: 서브내비도 lg 부터 본문과 따로 스크롤한다 */}
      <nav
        data-scrollarea
        className={`hidden w-40 shrink-0 flex-col gap-0.5 lg:flex ${SCROLL_PANE}`}
      >
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

      <div
        data-scrollarea
        className={`flex min-w-0 flex-1 flex-col gap-8 ${SCROLL_PANE}`}
      >
        <AppearanceSection />
        <SourcesSection config={config} />
        <SummarySection config={config} />
        <CalendarSection config={config} />
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

/**
 * 기사 요약에 쓸 API 키.
 *
 * 값은 서버에만 있고 화면으로 돌아오지 않는다 — 끝 네 자리만 보여준다.
 * 저장은 AES-GCM 암호화를 거친다 (CLAUDE.md 절대 규칙 3).
 */
function SummarySection({ config }: { config: Config }) {
  const [statuses, setStatuses] = useState<SecretStatus[] | null>(null);
  const [canStore, setCanStore] = useState(true);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { tone: "ok" | "error"; text: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSecrets(config).then((result) => {
      if (cancelled) return;
      if (result.kind === "ok") {
        setStatuses(result.secrets);
        setCanStore(result.canStore);
      } else {
        setMessage({ tone: "error", text: describe(result) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const anthropic = statuses?.find((item) => item.name === "anthropic");

  async function submit(next: string) {
    setBusy(true);
    const result = await saveSecret(config, "anthropic", next);
    setBusy(false);

    if (result.kind === "ok") {
      setStatuses(result.secrets);
      setValue("");
      setMessage({
        tone: "ok",
        text: next === "" ? "지웠습니다." : "저장했습니다.",
      });
      return;
    }
    setMessage({
      tone: "error",
      text:
        result.kind === "bad_format"
          ? "Anthropic 키는 sk-ant- 로 시작합니다. 다시 확인해 주세요."
          : result.kind === "no_encryption_key"
            ? "서버에 ENCRYPTION_KEY 가 없어 암호화 저장을 할 수 없습니다. 평문으로 두지 않으려고 거부했습니다."
            : describe(result),
    });
  }

  return (
    <Section
      id="summary"
      title="요약 API"
      note="기사를 한 줄로 줄이고 '왜 중요한가'를 판단하는 데 Claude API 를 씁니다. 키는 서버에 암호화해 저장되고 화면으로 돌아오지 않습니다."
      aside={
        anthropic?.set ? (
          <Tag tone="accent">연결됨</Tag>
        ) : (
          <Tag>아직 없음</Tag>
        )
      }
    >
      {statuses === null && !message ? (
        <p className="text-sm text-dim">불러오는 중…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {anthropic?.set ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-sm">
                  {anthropic.label} ••••{anthropic.tail}
                </span>
                <span className="text-xs text-dim">
                  {anthropic.fromEnv
                    ? "서버 .env 에서 읽었습니다. 화면에서 바꾸면 이 값을 덮어씁니다."
                    : anthropic.updatedAt
                      ? `${anthropic.updatedAt.slice(0, 10)} 에 저장됨`
                      : "저장됨"}
                </span>
              </span>
              {anthropic.fromEnv ? null : (
                <Button onClick={() => void submit("")} disabled={busy}>
                  지우기
                </Button>
              )}
            </div>
          ) : null}

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (value.trim() !== "" && !busy) void submit(value);
            }}
          >
            <Field
              label={anthropic?.set ? "새 키로 바꾸기" : "Anthropic API 키"}
            >
              <input
                type="password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
            </Field>

            {message ? (
              <Notice tone={message.tone}>{message.text}</Notice>
            ) : null}

            <div>
              <Button
                type="submit"
                variant="primary"
                disabled={value.trim() === "" || busy || !canStore}
              >
                {busy ? "저장 중…" : "키 저장"}
              </Button>
            </div>
          </form>

          {canStore ? null : (
            <Notice tone="error">
              서버에 ENCRYPTION_KEY 가 없습니다. 설정하기 전까지는 키를 저장할 수
              없습니다 — 평문으로 두지 않기 위해서입니다.
            </Notice>
          )}

          <p className="text-xs leading-relaxed text-dim">
            키는 console.anthropic.com 에서 발급합니다. 요약은 하루 한 번만
            돌기 때문에 사용량은 크지 않습니다. 아직 요약 단계가 붙지 않아
            지금은 저장만 됩니다.
          </p>
        </div>
      )}
    </Section>
  );
}

/**
 * 캘린더 연결 — 공개 주소로 붙는다.
 *
 * 네이버 캘린더는 "공유" 를 켜면 주소 하나가 나오고, 그 주소로 일정을
 * 로그인 없이 읽을 수 있다. 그래서 여기서 받는 건 아이디도 비밀번호도 아닌
 * **주소**다.
 *
 * ⚠ 뒤집으면 그 주소를 아는 사람은 누구나 같은 일정을 읽는다는 뜻이다.
 *   자격증명과 다를 게 없어서 저장은 암호화 경로를 타고(subscriptions.ts),
 *   화면으로 되돌려주지 않는다. 노출 범위는 화면에도 적어둔다 —
 *   적지 않으면 "비공개로 연동된 것" 으로 잘못 읽힌다.
 */
function CalendarSection({ config }: { config: Config }) {
  const [subscriptions, setSubscriptions] = useState<
    CalendarSubscription[] | null
  >(null);
  const [legacy, setLegacy] = useState<SecretStatus[] | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { tone: "ok" | "error"; text: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSubscriptions(config).then((result) => {
      if (cancelled) return;
      if (result.kind === "ok") setSubscriptions(result.subscriptions);
      else setMessage({ tone: "error", text: describe(result) });
    });
    // 예전에 CalDAV 로 넣어둔 계정이 남아 있으면 정리할 수 있게 보여준다.
    void fetchSecrets(config).then((result) => {
      if (!cancelled && result.kind === "ok") setLegacy(result.secrets);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const naverId = legacy?.find((item) => item.name === "naver_id");
  const naverPassword = legacy?.find((item) => item.name === "naver_password");
  const hasLegacy = Boolean(naverId?.set || naverPassword?.set);
  const connected = (subscriptions?.length ?? 0) > 0;
  const active = subscriptions?.filter((item) => item.enabled).length ?? 0;
  // 붙어는 있는데 다 꺼둔 상태. "연결 전" 과 섞으면 화면이 거짓말을 한다.
  const allOff = connected && active === 0;
  const ready = url.trim() !== "" && !busy;

  async function addUrl() {
    setBusy(true);
    setMessage(null);
    const result = await addSubscription(config, url);
    setBusy(false);

    if (result.kind === "ok") {
      setSubscriptions(result.subscriptions);
      setUrl("");
      setMessage({ tone: "ok", text: "캘린더를 붙였어요. 일정 탭에서 바로 보입니다." });
      return;
    }
    if (result.kind === "rejected") {
      setMessage({ tone: "error", text: rejectionText(result.message) });
      return;
    }
    setMessage({ tone: "error", text: describe(result) });
  }

  /**
   * 체크박스. 빼기와 달리 주소를 지우지 않으니 되돌리는 값이 싸다 —
   * 그래서 먼저 반영하고 실패하면 되돌린다. 늦게 움직이면 안 눌린 줄 안다.
   */
  async function toggle(item: CalendarSubscription) {
    if (!subscriptions) return;
    const before = subscriptions;
    setSubscriptions(
      subscriptions.map((entry) =>
        entry.id === item.id ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    );
    setMessage(null);

    const result = await toggleSubscription(config, item.id, !item.enabled);
    if (result.kind === "ok") {
      setSubscriptions(result.subscriptions);
      return;
    }
    setSubscriptions(before); // 되돌린다
    setMessage({ tone: "error", text: describe(result) });
  }

  async function drop(id: string) {
    setBusy(true);
    const result = await removeSubscription(config, id);
    setBusy(false);
    if (result.kind === "ok") {
      setSubscriptions(result.subscriptions);
      setMessage({ tone: "ok", text: "캘린더를 뺐어요." });
    } else {
      setMessage({ tone: "error", text: describe(result) });
    }
  }

  /** 예전 CalDAV 자격증명 지우기. 안 쓰는 비밀번호를 남겨둘 이유가 없다. */
  async function clearLegacy() {
    setBusy(true);
    await saveSecret(config, "naver_id", "");
    const result = await saveSecret(config, "naver_password", "");
    setBusy(false);
    if (result.kind !== "ok") {
      // 조용히 넘어가면 안 지워졌는데 지워진 줄 안다.
      setMessage({ tone: "error", text: explain(result) });
      return;
    }
    setLegacy(result.secrets);
    setMessage({ tone: "ok", text: "저장돼 있던 앱 비밀번호를 지웠어요." });
  }

  return (
    <Section
      id="calendar"
      title="캘린더"
      note="일정 탭과 아침 브리핑에 띄울 캘린더를 주소로 붙여요. 체크한 캘린더만 불러옵니다. 주소는 서버에만 암호화되어 저장되고 브라우저엔 남지 않습니다."
      aside={
        allOff ? (
          <Tag>모두 꺼둠</Tag>
        ) : connected ? (
          <Tag tone="accent">연결됨</Tag>
        ) : (
          <Tag>연결 전</Tag>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Kicker>연결된 캘린더</Kicker>

          {subscriptions === null ? (
            <div className="rounded-xl border border-line px-4 py-4 text-sm text-dim">
              불러오는 중이에요…
            </div>
          ) : connected ? (
            <ul className="flex flex-col gap-2">
              {subscriptions.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                >
                  {/*
                    체크박스와 이름만 label 로 묶는다. 줄 전체를 묶으면
                    빼기 버튼을 눌러도 체크가 같이 토글된다.
                  */}
                  <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => void toggle(item)}
                      disabled={busy}
                      className="size-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={`font-display text-sm break-keep ${
                          item.enabled ? "" : "text-dim"
                        }`}
                      >
                        {item.label}
                      </span>
                      <span className="text-xs text-dim break-keep">
                        네이버 캘린더{item.owner ? ` · ${item.owner}` : ""}
                        {item.enabled ? "" : " · 안 불러오는 중"}
                      </span>
                    </span>
                  </label>
                  <Button
                    onClick={() => void drop(item.id)}
                    disabled={busy}
                    title={`${item.label} 빼기`}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                    빼기
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-1.5 rounded-xl border border-line px-4 py-4">
              <CalendarX size={18} strokeWidth={1.5} className="text-dim" />
              <span className="text-sm">아직 연결한 캘린더가 없어요</span>
              <span className="text-xs text-dim break-keep">
                아래에 공유 주소를 넣으면 일정 탭이 채워집니다.
              </span>
            </div>
          )}

          {/*
            다 꺼두면 일정 탭이 빈 달력이 된다. 여기 안 적으면 나중에
            그 빈 화면을 보고 연동이 끊긴 줄 안다.
          */}
          {allOff ? (
            <p className="text-xs leading-relaxed text-dim break-keep">
              지금은 전부 꺼져 있어서 일정 탭에 아무것도 안 들어와요.
              캘린더는 그대로 있으니 체크만 켜면 됩니다.
            </p>
          ) : null}

          {hasLegacy ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  예전 방식으로 저장된 계정 {naverId?.tail ? `· ${naverId.tail}` : ""}
                </span>
                <span className="text-xs text-dim break-keep">
                  이제 주소로 붙이기 때문에 앱 비밀번호는 쓰지 않아요. 지워도 됩니다.
                </span>
              </span>
              <Button onClick={() => void clearLegacy()} disabled={busy}>
                지우기
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <Kicker>캘린더 주소 추가</Kicker>

          <form
            className="flex flex-col gap-3 rounded-xl border border-line p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) void addUrl();
            }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-base">네이버 캘린더</span>
              <span className="text-xs leading-relaxed text-dim break-keep">
                네이버 캘린더에서 <b>캘린더 공유 · 공개 설정</b>을 켜면 나오는
                주소를 넣어주세요. 비밀번호는 필요 없어요.
              </span>
            </div>

            <Field label="공유 주소">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://naver.me/xxxxxxxx"
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
                className={inputClass}
              />
            </Field>

            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" disabled={!ready}>
                <Link2 size={16} strokeWidth={1.5} />
                {busy ? "확인 중…" : "추가하기"}
              </Button>
              <span className="text-xs text-dim break-keep">
                주소가 살아 있는지 넣을 때 한 번 확인해요
              </span>
            </div>

            <p className="text-xs leading-relaxed text-dim break-keep">
              ⚠ 공개 주소라서 <b>이 주소를 아는 사람은 누구나</b> 해당 캘린더의
              일정을 볼 수 있어요. 남에게 보이면 안 되는 일정은 다른 캘린더에
              두거나, 공유를 꺼주세요.
            </p>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">Google 캘린더</span>
              <span className="text-xs text-dim">
                계정으로 로그인해 읽기 권한만 받아요
              </span>
            </span>
            <PendingButton title="Google 캘린더 연결">연결하기</PendingButton>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">iCal 주소로 구독</span>
              <span className="text-xs text-dim">
                .ics 주소만 있으면 어떤 캘린더든 읽어와요
              </span>
            </span>
            <PendingButton title="iCal 주소 넣기">주소 넣기</PendingButton>
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * 서버가 붙여 보낸 실패 코드를 사람 말로.
 * request() 가 400 을 문자열로 싸버려서 코드가 메시지 안에 섞여 온다.
 */
function rejectionText(raw: string): string {
  if (raw.includes("duplicate")) return "이미 넣어둔 캘린더예요.";
  if (raw.includes("no_encryption_key")) {
    return "서버에 ENCRYPTION_KEY 가 없어 암호화 저장을 할 수 없습니다.";
  }
  if (raw.includes("invalid_body")) return "주소를 넣어주세요.";
  // bad_url · not_found · network · protocol 은 서버가 사람 말 메시지를 같이 보낸다.
  return raw;
}

/** saveSecret 의 실패 종류를 사람 말로. */
function explain(result: SaveSecretResult): string {
  if (result.kind === "no_encryption_key") {
    return "서버에 ENCRYPTION_KEY 가 없어 암호화 저장을 할 수 없습니다.";
  }
  if (result.kind === "bad_format") return "형식이 맞지 않습니다.";
  if (result.kind === "ok") return "";
  return describe(result);
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

