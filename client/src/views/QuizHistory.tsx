import { useEffect, useState } from "react";
import type { QuizAttempt, QuizSession, QuizSessionSummary } from "@shared/types";
import { Check, ChevronLeft, ChevronRight, Minus, X } from "lucide-react";
import { Answer, Meta } from "../components/QuizCard";
import { Button } from "../components/ui";
import {
  describeFailure,
  fetchQuizSession,
  fetchQuizSessions,
} from "../lib/api";
import type { Config } from "../lib/config";
import type { Question } from "../lib/quiz";

/**
 * 지난 판 기록.
 *
 * 맞음·틀림을 색으로만 구분하지 않는다 — 팔레트에 성공/실패 색이 없고,
 * 그걸 넣으려면 여섯 조합(밝기 2 × 색조 3)에 값을 다 채워야 한다.
 * 모양(채운 원 · 빈 원)과 글자를 함께 쓰면 색 없이도 읽히고, 색맹인 눈에도 같다.
 */

export function QuizHistory({
  config,
  questions,
  onBack,
}: {
  config: Config;
  /** 기록에는 문제 id 만 남는다. 본문은 여기서 찾는다 */
  questions: Question[];
  onBack: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return openId ? (
    <Detail
      config={config}
      questions={questions}
      id={openId}
      onBack={() => setOpenId(null)}
    />
  ) : (
    <List config={config} onOpen={setOpenId} onBack={onBack} />
  );
}

function List({
  config,
  onOpen,
  onBack,
}: {
  config: Config;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const [sessions, setSessions] = useState<QuizSessionSummary[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchQuizSessions(config).then((result) => {
      if (!alive) return;
      if (result.kind === "ok") setSessions(result.sessions);
      else setFailed(describeFailure(result));
    });
    return () => {
      alive = false;
    };
  }, [config]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="font-display text-lg">문제 푼 기록</h2>
          {sessions ? (
            <span className="text-xs text-dim">{sessions.length}판</span>
          ) : null}
        </div>
        <Button onClick={onBack}>
          <ChevronLeft size={15} />
          문제로
        </Button>
      </div>

      {failed ? (
        <Notice title="기록을 불러오지 못했어요" detail={failed}>
          기록은 서버에 저장돼요. 서버가 꺼져 있으면 지난 판을 볼 수 없지만,
          문제는 그대로 풀 수 있어요.
        </Notice>
      ) : !sessions ? (
        <p className="text-sm text-dim">기록을 불러오는 중…</p>
      ) : sessions.length === 0 ? (
        <Notice title="아직 푼 기록이 없어요">
          문제 화면에서 "문제 풀기"로 한 판 풀면 여기에 남아요.
        </Notice>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-base">{s.scope}</span>
                  <span className="font-display text-xs tabular-nums text-dim">
                    {s.total}문제
                  </span>
                </div>
                <span className="text-xs text-dim">{whenLabel(s.startedAt)}</span>
              </div>

              <Score
                correct={s.correct}
                wrong={s.wrong}
                ungraded={s.ungraded}
              />
              <ChevronRight size={16} className="shrink-0 text-dim" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({
  config,
  questions,
  id,
  onBack,
}: {
  config: Config;
  questions: Question[];
  id: string;
  onBack: () => void;
}) {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchQuizSession(config, id).then((result) => {
      if (!alive) return;
      if (result.kind === "ok") setSession(result.session);
      else setFailed(describeFailure(result));
    });
    return () => {
      alive = false;
    };
  }, [config, id]);

  const byId = new Map(questions.map((q) => [q.id, q]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-display text-lg">
            {session ? session.scope : "기록"}
            {session ? (
              <span className="ml-2 font-display text-xs tabular-nums text-dim">
                {session.attempts.length}문제
              </span>
            ) : null}
          </h2>
          {session ? (
            <span className="text-xs text-dim">
              {whenLabel(session.startedAt)}
            </span>
          ) : null}
        </div>
        <Button onClick={onBack}>
          <ChevronLeft size={15} />
          기록 목록
        </Button>
      </div>

      {failed ? (
        <Notice title="이 판을 불러오지 못했어요" detail={failed}>
          목록에는 있었는데 서버에서 찾지 못했어요.
        </Notice>
      ) : !session ? (
        <p className="text-sm text-dim">불러오는 중…</p>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="text-sm text-mid">이 판의 결과</span>
            <span className="flex-1" />
            <Score
              correct={session.attempts.filter((a) => a.grade === "correct").length}
              wrong={session.attempts.filter((a) => a.grade === "wrong").length}
              ungraded={session.attempts.filter((a) => a.grade === null).length}
            />
          </div>

          <div className="flex flex-col gap-2">
            {session.attempts.map((attempt, i) => (
              <AttemptRow
                key={`${attempt.id}-${i}`}
                attempt={attempt}
                index={i}
                question={byId.get(attempt.id)}
                open={openQuestion === `${attempt.id}-${i}`}
                onToggle={() =>
                  setOpenQuestion((prev) =>
                    prev === `${attempt.id}-${i}` ? null : `${attempt.id}-${i}`,
                  )
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AttemptRow({
  attempt,
  index,
  question,
  open,
  onToggle,
}: {
  attempt: QuizAttempt;
  index: number;
  /** 문제집에서 빠진 문제일 수 있다. 그때도 기록은 읽혀야 한다 */
  question: Question | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-14 items-center gap-3 p-4 text-left transition-colors hover:bg-fg/[0.04]"
      >
        <span className="font-display w-6 shrink-0 text-xs tabular-nums text-dim">
          {index + 1}
        </span>
        <Mark grade={attempt.grade} />
        <span className="min-w-0 flex-1 truncate text-sm">{attempt.title}</span>
        <span className="font-display shrink-0 text-xs tabular-nums text-dim">
          [{attempt.no}]
        </span>
        <ChevronRight
          size={16}
          className={`shrink-0 text-dim transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open ? (
        question ? (
          <div className="flex flex-col gap-3 border-t border-line p-4">
            <Meta question={question} />
            <p className="font-display text-xl leading-tight break-keep">
              {question.title}
            </p>
            <p className="text-sm leading-7 break-keep">{question.question}</p>
            <Answer question={question} />
          </div>
        ) : (
          <p className="border-t border-line p-4 text-sm text-dim">
            이 문제는 지금 문제집에 없어요. 기록에는 제목과 채점만 남아 있어요.
          </p>
        )
      ) : null}
    </div>
  );
}

/** 채운 원 = 맞음, 빈 원 = 틀림, 선 = 채점 안 함. 글자를 늘 함께 둔다. */
function Mark({ grade }: { grade: QuizAttempt["grade"] }) {
  if (grade === "correct") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[11px] whitespace-nowrap text-bg">
        <Check size={12} />
        맞음
      </span>
    );
  }
  if (grade === "wrong") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent px-2.5 py-0.5 text-[11px] whitespace-nowrap text-accent">
        <X size={12} />
        틀림
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-0.5 text-[11px] whitespace-nowrap text-dim">
      <Minus size={12} />안 함
    </span>
  );
}

function Score({
  correct,
  wrong,
  ungraded,
}: {
  correct: number;
  wrong: number;
  ungraded: number;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap">
      <span className="font-display tabular-nums text-accent">맞음 {correct}</span>
      <span className="text-line">·</span>
      <span className="font-display tabular-nums text-mid">틀림 {wrong}</span>
      {ungraded > 0 ? (
        <>
          <span className="text-line">·</span>
          <span className="font-display tabular-nums text-dim">
            안 함 {ungraded}
          </span>
        </>
      ) : null}
    </span>
  );
}

function Notice({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex max-w-lg flex-col items-start gap-2 self-start rounded-2xl border border-line bg-surface p-6">
      <h3 className="font-display text-lg">{title}</h3>
      <p className="text-sm">{children}</p>
      {detail ? <p className="text-xs leading-relaxed text-dim">{detail}</p> : null}
    </div>
  );
}

/** "8월 31일 14:20" — 판을 구분할 수 있을 만큼만. */
function whenLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "시각 모름";
  const now = new Date();
  const sameYear = at.getFullYear() === now.getFullYear();
  const date = `${sameYear ? "" : `${at.getFullYear()}년 `}${at.getMonth() + 1}월 ${at.getDate()}일`;
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}
