import type { ComponentProps, ReactNode } from "react";

/**
 * 디자인 문서의 .btn · .tag · 구획 라벨을 옮긴 것들.
 *
 * CSS 클래스로 두지 않고 컴포넌트로 만든 이유는 이 앱이 Tailwind 로 쓰여서다 —
 * 두 체계를 섞으면 어느 쪽이 이기는지 매번 확인하게 된다.
 */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-display text-sm " +
  "leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-45";

const VARIANTS = {
  primary: "border border-accent bg-accent text-bg hover:brightness-110",
  secondary: "border border-line hover:bg-fg/[0.07] active:bg-fg/[0.14]",
  ghost: "border border-transparent text-accent hover:bg-accent/10",
} as const;

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type="button"
      {...props}
      className={`${BUTTON_BASE} ${VARIANTS[variant]} min-h-11 px-4 ${className}`}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  className = "",
  external,
  ...props
}: ComponentProps<"a"> & {
  variant?: keyof typeof VARIANTS;
  external?: boolean;
}) {
  return (
    <a
      {...props}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className={`${BUTTON_BASE} ${VARIANTS[variant]} min-h-11 px-4 ${className}`}
    />
  );
}

/** 아직 동작하지 않는 액션. 되는 척하지 않도록 disabled 로 둔다. */
export function PendingButton({
  children,
  title,
  className = "",
}: {
  children: ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <Button
      disabled
      title={`${title} — 다음 단계에서 연결됩니다`}
      className={className}
    >
      {children}
    </Button>
  );
}

export function Tag({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "outline";
  children: ReactNode;
}) {
  const styles = {
    neutral: "bg-line text-mid",
    accent: "bg-accent-soft text-accent-ink",
    outline: "border border-accent text-accent",
  } as const;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] leading-normal ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

/** 도면 구획 이름. 본문 위에 작게 얹는 라벨이다. */
export function Kicker({
  children,
  tone = "dim",
}: {
  children: ReactNode;
  tone?: "dim" | "accent";
}) {
  return (
    <span
      className={`text-[11px] uppercase tracking-[0.1em] ${
        tone === "accent" ? "text-accent" : "text-dim"
      }`}
    >
      {children}
    </span>
  );
}

/** 표면 위에 얹는 상자. 카드라기보다 구획에 가깝다. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-mid">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-sm " +
  "outline-none focus-visible:border-accent";
