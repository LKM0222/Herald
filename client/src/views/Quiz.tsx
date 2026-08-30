import { useEffect, useMemo, useState } from "react";
import type { QuizGrade, QuizSession } from "@shared/types";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  LayoutGrid,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { Answer, Card, Cover, Meta } from "../components/QuizCard";
import { Button } from "../components/ui";
import { describeFailure, saveQuizSession } from "../lib/api";
import type { Config } from "../lib/config";
import { loadQuiz, partsOf, topicsOf, type Question } from "../lib/quiz";
import { QuizHistory } from "./QuizHistory";

/**
 * 면접 문제 300개를 덮어두고 하나씩 펼쳐 보는 화면.
 *
 * 답이 **기본으로 가려져 있는 것**이 이 화면의 전부다. 펼쳐놓고 읽으면
 * 그냥 문서고, 가려두면 떠올려보게 된다.
 *
 * 세 모드를 오간다:
 * - 격자 — 훑어보기. 30장씩 늘려 그린다 (300장을 한 번에 그리면 첫 칠이 늦다)
 * - 풀기 — 무작위로 뽑은 한 판. 답을 펼치면 맞았는지 틀렸는지 채점한다
 * - 기록 — 지난 판들. 서버에 저장된다
 */

const PAGE = 30;

/** 한 판. 뽑힌 문제와 그 판의 채점 기록이 항상 같이 다녀야 어긋나지 않는다. */
type Run = { deck: Question[]; session: QuizSession };

/** Fisher-Yates. 원본을 건드리지 않는다 — pool 은 useMemo 가 들고 있는 것이다. */
function shuffle(items: Question[]): Question[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function Quiz({ config }: { config: Config }) {
  const [all, setAll] = useState<Question[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [part, setPart] = useState("all");
  const [topic, setTopic] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState(PAGE);

  const [run, setRun] = useState<Run | null>(null);
  const [runOpen, setRunOpen] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [asking, setAsking] = useState(false);
  const [count, setCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showingHistory, setShowingHistory] = useState(false);

  useEffect(() => {
    let alive = true;
    loadQuiz().then(
      (questions) => alive && setAll(questions),
      (error: unknown) =>
        alive &&
        setFailed(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      alive = false;
    };
  }, []);

  const pool = useMemo(() => {
    if (!all) return [];
    return all.filter(
      (q) =>
        (part === "all" || q.part === part) &&
        (topic === "all" || q.topic === topic),
    );
  }, [all, part, topic]);

  if (failed) {
    return (
      <div className="flex max-w-lg flex-col items-start gap-3 self-start rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-display text-xl">문제를 불러오지 못했어요</h2>
        <p className="text-sm">{failed}</p>
        <p className="text-xs leading-relaxed text-dim">
          이 화면의 문제는 서버를 쓰지 않아요. 새로고침해도 계속 이러면 배포된
          번들에 quiz.json 이 빠진 거예요.
        </p>
      </div>
    );
  }

  if (!all) {
    return <p className="self-start text-sm text-dim">문제를 불러오는 중…</p>;
  }

  if (showingHistory) {
    return (
      <QuizHistory
        config={config}
        questions={all}
        onBack={() => setShowingHistory(false)}
      />
    );
  }

  const cursor = run ? Math.min(idx, Math.max(run.deck.length - 1, 0)) : 0;
  const current = run?.deck[cursor];
  const atLast = run ? cursor >= run.deck.length - 1 : false;

  const openCount = all.filter((q) => open[q.id]).length;
  const scopeName = topic !== "all" ? topic : part !== "all" ? part : "전체";

  /** 저장 실패는 알리되 막지 않는다 — 서버가 없어도 문제는 계속 풀려야 한다. */
  const persist = async (session: QuizSession) => {
    const result = await saveQuizSession(config, session);
    setSaveError(result.kind === "ok" ? null : describeFailure(result));
  };

  const start = (picked: number) => {
    const deck = shuffle(pool).slice(0, Math.min(picked, pool.length));
    const now = new Date().toISOString();
    const session: QuizSession = {
      id: crypto.randomUUID(),
      startedAt: now,
      updatedAt: now,
      scope: scopeName,
      attempts: deck.map((q) => ({
        id: q.id,
        no: q.no,
        title: q.title,
        grade: null,
      })),
    };
    setRun({ deck, session });
    setRunOpen({});
    setIdx(0);
    setSaveError(null);
    void persist(session);
  };

  const grade = (mark: QuizGrade) => {
    if (!run) return;
    const next: QuizSession = {
      ...run.session,
      updatedAt: new Date().toISOString(),
      attempts: run.session.attempts.map((attempt, i) =>
        i === cursor ? { ...attempt, grade: mark } : attempt,
      ),
    };
    setRun({ ...run, session: next });
    void persist(next);
    // 채점했으면 다음 문제로. 마지막 문제면 그 자리에 둔다 — 끝 버튼이 거기 있다.
    if (cursor < run.deck.length - 1) setIdx(cursor + 1);
  };

  const rescope = (nextPart: string, nextTopic: string) => {
    setPart(nextPart);
    setTopic(nextTopic);
    setShown(PAGE);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Header
        scopeName={run ? run.session.scope : scopeName}
        run={run}
        poolLength={pool.length}
        cursor={cursor}
        openCount={openCount}
        total={all.length}
        onReset={() => setOpen({})}
        onRevealAll={() =>
          setOpen(Object.fromEntries(pool.map((q) => [q.id, true])))
        }
        onStart={() => {
          setCount(count || Math.min(10, pool.length));
          setAsking(true);
        }}
        onHistory={() => setShowingHistory(true)}
        onBackToGrid={() => setRun(null)}
      />

      {saveError ? (
        <p className="rounded-[10px] border border-dashed border-line px-3 py-2 text-xs leading-relaxed text-dim">
          채점은 화면에 남았지만 서버에 저장하지 못했어요 — {saveError}
        </p>
      ) : null}

      {run ? null : <Chips all={all} part={part} topic={topic} onPick={rescope} />}

      {run && current ? (
        <Solve
          question={current}
          opened={!!runOpen[current.id]}
          onReveal={(id, on) => setRunOpen((prev) => ({ ...prev, [id]: on }))}
          position={cursor + 1}
          run={run}
          onJump={setIdx}
          onPrev={() => setIdx(Math.max(cursor - 1, 0))}
          onNext={() => (atLast ? setRun(null) : setIdx(cursor + 1))}
          atLast={atLast}
          grade={run.session.attempts[cursor]?.grade ?? null}
          onGrade={grade}
        />
      ) : (
        <Grid
          questions={pool.slice(0, shown)}
          poolLength={pool.length}
          open={open}
          onReveal={(id, on) => setOpen((prev) => ({ ...prev, [id]: on }))}
          onMore={() => setShown((n) => n + PAGE)}
        />
      )}

      {asking ? (
        <CountDialog
          scopeName={scopeName}
          poolLength={pool.length}
          count={count || pool.length}
          onPick={setCount}
          onCancel={() => setAsking(false)}
          onGo={() => {
            setAsking(false);
            start(count || pool.length);
          }}
        />
      ) : null}
    </div>
  );
}

function Header({
  scopeName,
  run,
  poolLength,
  cursor,
  openCount,
  total,
  onReset,
  onRevealAll,
  onStart,
  onHistory,
  onBackToGrid,
}: {
  scopeName: string;
  run: Run | null;
  poolLength: number;
  cursor: number;
  openCount: number;
  total: number;
  onReset: () => void;
  onRevealAll: () => void;
  onStart: () => void;
  onHistory: () => void;
  onBackToGrid: () => void;
}) {
  const graded = run
    ? run.session.attempts.filter((a) => a.grade !== null).length
    : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="font-display text-lg">문제</h2>
        <span className="min-w-0 truncate text-xs text-dim">
          {run
            ? `${scopeName} ${run.deck.length}문제 · ${cursor + 1}번째 · 채점 ${graded}`
            : `${scopeName} ${poolLength}문제 · ${openCount}개 펼침 · 남은 ${total - openCount}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {run ? (
          <Button onClick={onBackToGrid}>
            <LayoutGrid size={15} />
            격자로
          </Button>
        ) : (
          <>
            <Button onClick={onHistory}>
              <History size={15} />
              기록
            </Button>
            <Button onClick={onReset}>
              <RotateCcw size={15} />
              다시 덮기
            </Button>
            <Button onClick={onRevealAll}>
              <Eye size={15} />
              전부 펼치기
            </Button>
            <Button variant="primary" onClick={onStart}>
              <Play size={15} />
              문제 풀기
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 분야 칩은 두 단이다. 위 단은 전체 · CS · Unity · 게임수학이고, 파트를 고르면
 * 그 파트의 세부 분야가 아랫줄에 붙는다.
 */
function Chips({
  all,
  part,
  topic,
  onPick,
}: {
  all: Question[];
  part: string;
  topic: string;
  onPick: (part: string, topic: string) => void;
}) {
  const chip =
    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors";
  const countText = "font-display tabular-nums opacity-80";

  const partChip = (active: boolean) =>
    `${chip} ${
      active
        ? "bg-accent text-bg"
        : "border border-line text-mid hover:border-accent hover:text-accent"
    }`;

  const topicChip = (active: boolean) =>
    `${chip} ${
      active
        ? "border border-accent bg-accent-soft text-accent-ink"
        : "border border-dashed border-line text-dim hover:border-accent hover:text-accent"
    }`;

  return (
    /*
      두 줄로 나눈다. 한 줄에 이어 붙이면 파트와 세부 분야가 같은 단으로 보이고,
      개수가 파트마다 달라(CS 9 · Unity 14 · 게임수학 11) 줄바꿈이 매번 다른
      자리에서 일어나 어디까지가 위 단인지가 화면 폭마다 바뀐다.
    */
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPick("all", "all")}
          className={partChip(part === "all")}
        >
          전체<span className={countText}>{all.length}</span>
        </button>

        {partsOf(all).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name, "all")}
            /*
              세부 분야를 고른 동안에도 켜둔다 — 줄이 갈리면서 "지금 어느 파트
              안에 있나"를 말해주는 것이 이 칩밖에 없어졌다.
            */
            className={partChip(part === name)}
          >
            {name}
            <span className={countText}>
              {all.filter((q) => q.part === name).length}
            </span>
          </button>
        ))}
      </div>

      {part === "all" ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPick(part, "all")}
            className={topicChip(topic === "all")}
          >
            전체
            <span className={countText}>
              {all.filter((q) => q.part === part).length}
            </span>
          </button>

          {topicsOf(all, part).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onPick(part, name)}
              className={topicChip(topic === name)}
            >
              {name}
              <span className={countText}>
                {all.filter((q) => q.part === part && q.topic === name).length}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Grid({
  questions,
  poolLength,
  open,
  onReveal,
  onMore,
}: {
  questions: Question[];
  poolLength: number;
  open: Record<string, boolean>;
  onReveal: (id: string, on: boolean) => void;
  onMore: () => void;
}) {
  if (questions.length === 0) {
    return <p className="text-sm text-dim">이 분야에는 아직 문제가 없어요.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 폰에서는 한 줄, 넓어지면 두 줄. 카드가 좁아지면 한국어가 잘게 끊긴다 */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {questions.map((q) => (
          <Card
            key={q.id}
            question={q}
            opened={!!open[q.id]}
            onReveal={onReveal}
          />
        ))}
      </div>

      {questions.length < poolLength ? (
        <div className="flex justify-center">
          <Button onClick={onMore}>
            <ChevronDown size={15} />
            더 보기 · {questions.length} / {poolLength}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Solve({
  question,
  opened,
  onReveal,
  position,
  run,
  onJump,
  onPrev,
  onNext,
  atLast,
  grade,
  onGrade,
}: {
  question: Question;
  opened: boolean;
  onReveal: (id: string, on: boolean) => void;
  position: number;
  run: Run;
  onJump: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  atLast: boolean;
  grade: QuizGrade | null;
  onGrade: (mark: QuizGrade) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* 진행 점. 채점한 것은 채워지고, 틀린 것은 테두리만 남는다 */}
      <div
        className="flex items-center gap-1 overflow-x-auto pb-1"
        data-scrollarea
      >
        {run.deck.map((q, i) => {
          const mark = run.session.attempts[i]?.grade ?? null;
          return (
            <button
              key={q.id}
              type="button"
              aria-label={`${i + 1}번째 문제로`}
              onClick={() => onJump(i)}
              className={`h-1.5 shrink-0 rounded-full transition-all ${
                i === position - 1
                  ? "w-8 bg-accent"
                  : mark === "correct"
                    ? "w-5 bg-accent"
                    : mark === "wrong"
                      ? "w-5 bg-accent/35"
                      : "w-5 bg-line"
              }`}
            />
          );
        })}
      </div>

      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-col gap-3 p-5 pb-4 sm:p-7 sm:pb-5">
          <Meta
            question={question}
            trailing={`${position} / ${run.deck.length}`}
          />
          <p className="font-display text-2xl leading-tight break-keep sm:text-3xl">
            {question.title}
          </p>
          <p className="text-[15px] leading-8 break-keep sm:text-base">
            {question.question}
          </p>
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5 sm:px-7 sm:pb-7">
          {opened ? (
            <>
              <Answer
                question={question}
                onHide={() => onReveal(question.id, false)}
                big
              />
              {/* 답을 본 다음에만 묻는다 — 보기 전에 채점할 수 있으면 기록이 뜻을 잃는다 */}
              <Grader grade={grade} onGrade={onGrade} />
            </>
          ) : (
            <Cover onClick={() => onReveal(question.id, true)} big />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button onClick={onPrev} disabled={position === 1}>
          <ChevronLeft size={15} />
          이전
        </Button>
        <span className="min-w-0 truncate text-center text-xs text-dim">
          {opened
            ? grade
              ? grade === "correct"
                ? "맞았다고 기록했어요"
                : "틀렸다고 기록했어요"
              : "맞았는지 골라주세요"
            : "먼저 떠올려보고 펼쳐보세요"}
        </span>
        <Button variant="primary" onClick={onNext}>
          {atLast ? "다 풀었어요" : "다음"}
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

/** 맞음·틀림 두 칸. 이미 고른 것이 있으면 그 칸이 켜져 있어 다시 고를 수 있다. */
function Grader({
  grade,
  onGrade,
}: {
  grade: QuizGrade | null;
  onGrade: (mark: QuizGrade) => void;
}) {
  const base =
    "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border text-sm transition-colors";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onGrade("correct")}
        className={`${base} ${
          grade === "correct"
            ? "border-accent bg-accent font-medium text-bg"
            : "border-line text-mid hover:border-accent hover:text-accent"
        }`}
      >
        <Check size={16} />
        맞았어요
      </button>
      <button
        type="button"
        onClick={() => onGrade("wrong")}
        className={`${base} ${
          grade === "wrong"
            ? "border-accent bg-accent-soft font-medium text-accent-ink"
            : "border-line text-mid hover:border-accent hover:text-accent"
        }`}
      >
        <X size={16} />
        틀렸어요
      </button>
    </div>
  );
}

function CountDialog({
  scopeName,
  poolLength,
  count,
  onPick,
  onCancel,
  onGo,
}: {
  scopeName: string;
  poolLength: number;
  count: number;
  onPick: (n: number) => void;
  onCancel: () => void;
  onGo: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const choices = [10, 20, 50].filter((n) => n < poolLength).concat(poolLength);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onCancel}
        className="absolute inset-0 bg-fg/25"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="몇 문제 풀까요"
        className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl">몇 문제 풀까요</h2>
          <p className="text-xs text-dim">
            {scopeName} {poolLength}문제 중에서 무작위로 뽑습니다
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {choices.map((n) => {
            const active = count === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onPick(n)}
                className={`flex min-h-12 items-center gap-2.5 rounded-[10px] border px-3.5 text-sm transition-colors ${
                  active
                    ? "border-accent bg-accent-soft font-medium text-accent-ink"
                    : "border-line text-mid hover:border-accent"
                }`}
              >
                <span
                  className={`size-4 shrink-0 rounded-full border ${
                    active
                      ? "border-accent bg-accent ring-3 ring-surface ring-inset"
                      : "border-line"
                  }`}
                />
                <span className="min-w-0 flex-1 text-left">
                  {n === poolLength ? `전부 ${n}문제` : `${n}문제`}
                </span>
                {n === poolLength ? null : (
                  <span className="font-display text-[13px] tabular-nums text-dim">
                    약 {n * 3}분
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button onClick={onCancel}>취소</Button>
          <Button variant="primary" onClick={onGo}>
            <Play size={15} />
            {count}문제 풀기
          </Button>
        </div>
      </div>
    </div>
  );
}
