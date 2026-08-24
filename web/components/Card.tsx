import type { ReactNode } from "react";

/**
 * 브리핑을 이루는 최소 단위.
 * 카드는 서로를 모르고 세로로 쌓이기만 해서, PC 2단 / 모바일 1단 전환이 배치만의 문제가 된다.
 */
export function Card({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {meta ? <span className="text-xs text-muted">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** 아직 동작하지 않는 액션. 되는 척하지 않도록 disabled 로 둔다. */
export function PendingButton({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={`${title} — 다음 단계에서 연결됩니다`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-2 text-xs text-muted opacity-50"
    >
      {children}
    </button>
  );
}
