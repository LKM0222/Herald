import { CornerDownRight, EyeOff, Hash } from "lucide-react";
import { Kicker } from "./ui";
import type { Question } from "../lib/quiz";

/**
 * 문제 한 장을 그리는 부품들.
 *
 * 문제 화면(격자 · 풀기)과 기록 화면이 같은 것을 쓴다 — 두 벌로 두면 한쪽에만
 * 꼬리 질문이 빠지는 식으로 조용히 어긋난다.
 */

const LEVEL_STYLES: Record<string, string> = {
  상: "bg-accent text-bg",
  중: "border border-accent text-accent",
  하: "border border-line text-dim",
};

export function Meta({
  question,
  trailing,
}: {
  question: Question;
  /** 오른쪽 끝에 분야 대신 넣을 것 (예: "3 / 10") */
  trailing?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-xs tabular-nums text-dim">
        [{question.no}]
      </span>
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap ${
          LEVEL_STYLES[question.level] ?? LEVEL_STYLES["하"]
        }`}
      >
        난이도 {question.level}
      </span>
      <span className="inline-flex shrink-0 items-center rounded-full border border-line px-2.5 py-0.5 text-[11px] whitespace-nowrap text-mid">
        {question.type}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-[11px] text-dim">
        {trailing ??
          `${question.star ? "★ " : ""}${question.part} · ${question.topic}`}
      </span>
    </div>
  );
}

/** 덮개. 점선 빗금으로 "여기 아래에 뭔가 있다"를 보이게 둔다. */
export function Cover({ onClick, big }: { onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-line text-mid transition-colors select-none hover:border-accent hover:text-accent ${
        big ? "min-h-14 text-sm" : "min-h-11 text-[13px]"
      }`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg,transparent,transparent 6px,var(--color-line) 6px,var(--color-line) 7px)",
      }}
    >
      <EyeOff size={big ? 16 : 15} />답 보기
    </button>
  );
}

export function Answer({
  question,
  onHide,
  big,
}: {
  question: Question;
  /** 없으면 덮기 버튼을 숨긴다 — 기록 화면처럼 늘 펼쳐두는 자리 */
  onHide?: () => void;
  big?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2.5 border-l-2 border-accent bg-accent-soft ${
        big ? "p-5" : "p-4"
      }`}
    >
      <div className="flex items-center gap-2">
        <Kicker tone="accent">정답</Kicker>
        <span className="flex-1" />
        {onHide ? (
          <button
            type="button"
            onClick={onHide}
            className="inline-flex min-h-9 items-center gap-1.5 px-1 text-[11px] text-dim transition-colors hover:text-accent"
          >
            <EyeOff size={13} />
            덮기
          </button>
        ) : null}
      </div>

      <p
        className={`font-semibold break-keep text-accent-ink ${
          big ? "text-base leading-relaxed" : "text-sm leading-relaxed"
        }`}
      >
        {question.answer}
      </p>

      <div className="h-px bg-line" />

      <Kicker>면접 답변</Kicker>
      <p
        className={`break-keep ${big ? "text-[15px] leading-8" : "text-[13px] leading-7"}`}
      >
        {question.interview}
      </p>

      {question.keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {question.keywords.map((word) => (
            <span
              key={word}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] text-mid"
            >
              <Hash size={11} />
              {word}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
        <span className="flex items-center gap-1.5">
          <CornerDownRight size={12} className="text-dim" />
          <Kicker>꼬리 질문</Kicker>
        </span>
        <p
          className={`font-medium break-keep ${big ? "text-[15px]" : "text-[13px]"} leading-relaxed`}
        >
          {question.followQ}
        </p>
        <p
          className={`break-keep text-mid ${big ? "text-sm" : "text-[13px]"} leading-7`}
        >
          {question.followA}
        </p>
      </div>
    </div>
  );
}

/** 격자 한 칸. 덮개를 눌러야 답이 보인다. */
export function Card({
  question,
  opened,
  onReveal,
}: {
  question: Question;
  opened: boolean;
  onReveal: (id: string, on: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-col gap-2 p-4 pb-3">
        <Meta question={question} />
        <p className="font-display text-xl leading-tight break-keep">
          {question.title}
        </p>
        <p className="text-[13px] leading-7 break-keep text-mid">
          {question.question}
        </p>
      </div>

      <div className="px-4 pb-4">
        {opened ? (
          <Answer question={question} onHide={() => onReveal(question.id, false)} />
        ) : (
          <Cover onClick={() => onReveal(question.id, true)} />
        )}
      </div>
    </div>
  );
}
