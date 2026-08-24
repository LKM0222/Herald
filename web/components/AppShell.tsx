import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/auth";
import { todayISO } from "@/lib/date";

/**
 * 같은 내비게이션을 두 자리에 놓는다 —
 * PC 는 좌측 사이드바, 모바일은 하단 탭바. 항목 정의는 하나뿐이다.
 */
const NAV = [
  { id: "today", icon: "📅", label: "오늘", ready: true },
  { id: "archive", icon: "🗂", label: "지난 기록", ready: false },
  { id: "sources", icon: "📰", label: "소스", ready: false },
  { id: "routines", icon: "🔁", label: "루틴", ready: false },
  { id: "settings", icon: "⚙", label: "설정", ready: false },
] as const;

export function AppShell({
  dateLabel,
  userName,
  children,
}: {
  dateLabel: string;
  userName?: string | null;
  children: ReactNode;
}) {
  const todayHref = `/d/${todayISO()}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-2">
          <span className="text-lg leading-none">🐓</span>
          <span className="font-semibold tracking-tight">Herald</span>
          <span className="text-sm text-muted">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {userName ? (
            <span className="hidden text-sm text-muted sm:inline">{userName}</span>
          ) : null}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-border px-3 text-xs text-muted hover:text-foreground"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        {/* 사이드바 — PC 전용 */}
        <nav className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border p-3 md:flex">
          {NAV.map((item) =>
            item.ready ? (
              <Link
                key={item.id}
                href={todayHref}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-accent/10 px-3 text-sm font-medium text-accent"
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ) : (
              <span
                key={item.id}
                title="다음 단계에서 연결됩니다"
                className="flex min-h-11 cursor-default items-center gap-2 rounded-lg px-3 text-sm text-muted opacity-50"
              >
                <span>{item.icon}</span>
                {item.label}
              </span>
            ),
          )}
        </nav>

        {/* 본문 — 하단 탭바에 가리지 않도록 모바일에서 아래 여백을 준다 */}
        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 md:pb-8">{children}</main>
      </div>

      {/* 하단 탭바 — 모바일 전용 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden">
        {NAV.map((item) =>
          item.ready ? (
            <Link
              key={item.id}
              href={todayHref}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-accent"
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </Link>
          ) : (
            <span
              key={item.id}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-muted opacity-50"
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
