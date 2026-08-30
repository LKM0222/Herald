import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  Eye,
  EyeOff,
  Hash,
  LayoutGrid,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button, Kicker } from "../components/ui";
import { loadQuiz, partsOf, topicsOf, type Question } from "../lib/quiz";

/**
 * 면접 문제 300개를 덮어두고 하나씩 펼쳐 보는 화면.
 *
 * 답이 **기본으로 가려져 있는 것**이 이 화면의 전부다. 펼쳐놓고 읽으면
 * 그냥 문서고, 가려두면 떠올려보게 된다. 그래서 "전부 펼치기"는 있어도
 * 기본값이 되지는 않는다.
 *
 * 두 모드를 오간다:
 * - 격자 — 훑어보기. 30장씩 늘려 그린다 (300장을 한 번에 그리면 첫 칠이 늦다)
 * - 풀기 — 한 문제씩. 앞에서부터 고른 개수만큼 가져온다
 */

const PAGE = 30;

export function Quiz() {
  const [all, setAll] = useState<Question[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [part, setPart] = useState("all");
  const [topic, setTopic] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState(PAGE);
  const [idx, setIdx] = useState(0);
  const [solving, setSolving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    loadQuiz().then(
      (questions) => alive && setAll(questions),
      (error: unknown) =>
        alive && setFailed(error instanceof Error ? error.message : String(error)),
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
          이 화면은 서버를 쓰지 않아요. 새로고침해도 계속 이러면 배포된 번들에
          quiz.json 이 빠진 거예요.
        </p>
      </div>
    );
  }

  if (!all) {
    return <p className="self-start text-sm text-dim">문제를 불러오는 중…</p>;
  }

  /** 고른 만큼만 앞에서 가져온다. 0 이거나 풀보다 크면 전부. */
  const deck =
    solving && count > 0 && count < pool.length ? pool.slice(0, count) : pool;
  const cursor = Math.min(idx, Math.max(deck.length - 1, 0));
  const current = deck[cursor];
  const atLast = cursor >= deck.length - 1;

  const openCount = all.filter((q) => open[q.id]).length;
  const scopeName = topic !== "all" ? topic : part !== "all" ? part : "전체";

  const reveal = (id: string, on: boolean) =>
    setOpen((prev) => ({ ...prev, [id]: on }));

  /** 범위를 바꾸면 펼침 상태는 두되 위치·장수는 처음으로 되돌린다. */
  const rescope = (nextPart: string, nextTopic: string) => {
    setPart(nextPart);
    setTopic(nextTopic);
    setIdx(0);
    setShown(PAGE);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Header
        scopeName={scopeName}
        solving={solving}
        deckLength={deck.length}
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
        onBackToGrid={() => setSolving(false)}
      />

      {solving ? null : (
        <Chips
          all={all}
          part={part}
          topic={topic}
          onPick={rescope}
        />
      )}

      {solving ? (
        current ? (
          <Solve
            question={current}
            opened={!!open[current.id]}
            onReveal={reveal}
            position={cursor + 1}
            total={deck.length}
            deck={deck}
            open={open}
            onJump={setIdx}
            onPrev={() => setIdx(Math.max(cursor - 1, 0))}
            onNext={() => (atLast ? setSolving(false) : setIdx(cursor + 1))}
            atLast={atLast}
          />
        ) : null
      ) : (
        <Grid
          questions={pool.slice(0, shown)}
          poolLength={pool.length}
          open={open}
          onReveal={reveal}
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
            setSolving(true);
            setIdx(0);
          }}
        />
      ) : null}
    </div>
  );
}

function Header({
  scopeName,
  solving,
  deckLength,
  poolLength,
  cursor,
  openCount,
  total,
  onReset,
  onRevealAll,
  onStart,
  onBackToGrid,
}: {
  scopeName: string;
  solving: boolean;
  deckLength: number;
  poolLength: number;
  cursor: number;
  openCount: number;
  total: number;
  onReset: () => void;
  onRevealAll: () => void;
  onStart: () => void;
  onBackToGrid: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="font-display text-lg">문제</h2>
        <span className="min-w-0 truncate text-xs text-dim">
          {solving
            ? `${scopeName} ${deckLength}문제 · ${cursor + 1}번째`
            : `${scopeName} ${poolLength}문제 · ${openCount}개 펼침 · 남은 ${total - openCount}`}
        </span>
      </div>

      {/*
        shrink-0 을 주지 않는다 — 320px 에서 세 버튼이 한 줄에 못 들어가는데,
        안 줄어들게 막으면 flex-wrap 이 걸리기 전에 오른쪽 버튼이 화면 밖으로
        나간다 (가로 스크롤은 안 생기고 잘리기만 해서 더 늦게 발견된다).
      */}
      <div className="flex flex-wrap items-center gap-2">
        {solving ? (
          <Button onClick={onBackToGrid}>
            <LayoutGrid size={15} />
            격자로
          </Button>
        ) : (
          <>
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
 * 그 파트의 세부 분야가 점선 칩으로 이어 붙는다.
 * 34개 분야를 한 줄에 늘어놓지 않기 위한 것 — 폰에서는 그게 전부 줄바꿈된다.
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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onPick("all", "all")}
        className={`${chip} ${
          part === "all"
            ? "bg-accent text-bg"
            : "border border-line text-mid hover:border-accent hover:text-accent"
        }`}
      >
        전체<span className={countText}>{all.length}</span>
      </button>

      {partsOf(all).map((name) => {
        const active = part === name && topic === "all";
        return (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name, "all")}
            className={`${chip} ${
              active
                ? "bg-accent text-bg"
                : "border border-line text-mid hover:border-accent hover:text-accent"
            }`}
          >
            {name}
            <span className={countText}>
              {all.filter((q) => q.part === name).length}
            </span>
          </button>
        );
      })}

      {part === "all"
        ? null
        : topicsOf(all, part).map((name) => {
            const active = topic === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onPick(part, name)}
                className={`${chip} ${
                  active
                    ? "border border-accent bg-accent-soft text-accent-ink"
                    : "border border-dashed border-line text-dim hover:border-accent hover:text-accent"
                }`}
              >
                {name}
                <span className={countText}>
                  {all.filter((q) => q.part === part && q.topic === name).length}
                </span>
              </button>
            );
          })}
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

const LEVEL_STYLES: Record<string, string> = {
  상: "bg-accent text-bg",
  중: "border border-accent text-accent",
  하: "border border-line text-dim",
};

function Meta({ question, trailing }: { question: Question; trailing?: string }) {
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
function Cover({ onClick, big }: { onClick: () => void; big?: boolean }) {
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
      <EyeOff size={big ? 16 : 15} />
      답 보기
    </button>
  );
}

function Answer({
  question,
  onHide,
  big,
}: {
  question: Question;
  onHide: () => void;
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
        <button
          type="button"
          onClick={onHide}
          className="inline-flex min-h-9 items-center gap-1.5 px-1 text-[11px] text-dim transition-colors hover:text-accent"
        >
          <EyeOff size={13} />
          덮기
        </button>
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
      <p className={`break-keep ${big ? "text-[15px] leading-8" : "text-[13px] leading-7"}`}>
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
        <p className={`font-medium break-keep ${big ? "text-[15px]" : "text-[13px]"} leading-relaxed`}>
          {question.followQ}
        </p>
        <p className={`break-keep text-mid ${big ? "text-sm" : "text-[13px]"} leading-7`}>
          {question.followA}
        </p>
      </div>
    </div>
  );
}

function Card({
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
        {opened ? null : <Cover onClick={() => onReveal(question.id, true)} />}
      </div>

      {opened ? (
        <div className="px-4 pb-4">
          <Answer question={question} onHide={() => onReveal(question.id, false)} />
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
  total,
  deck,
  open,
  onJump,
  onPrev,
  onNext,
  atLast,
}: {
  question: Question;
  opened: boolean;
  onReveal: (id: string, on: boolean) => void;
  position: number;
  total: number;
  deck: Question[];
  open: Record<string, boolean>;
  onJump: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  atLast: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* 진행 점. 30개를 넘어가면 폰에서 한 줄에 안 들어와 가로로만 굴린다 */}
      <div
        className="flex items-center gap-1 overflow-x-auto pb-1"
        data-scrollarea
      >
        {deck.map((q, i) => (
          <button
            key={q.id}
            type="button"
            aria-label={`${i + 1}번째 문제로`}
            onClick={() => onJump(i)}
            className={`h-1.5 shrink-0 rounded-full transition-all ${
              i === position - 1
                ? "w-8 bg-accent"
                : open[q.id]
                  ? "w-5 bg-accent/45"
                  : "w-5 bg-line"
            }`}
          />
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-col gap-3 p-5 pb-4 sm:p-7 sm:pb-5">
          <Meta question={question} trailing={`${position} / ${total}`} />
          <p className="font-display text-2xl leading-tight break-keep sm:text-3xl">
            {question.title}
          </p>
          <p className="text-[15px] leading-8 break-keep sm:text-base">
            {question.question}
          </p>
        </div>

        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          {opened ? (
            <Answer
              question={question}
              onHide={() => onReveal(question.id, false)}
              big
            />
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
          {opened ? "답을 봤어요" : "먼저 떠올려보고 펼쳐보세요"}
        </span>
        <Button variant="primary" onClick={onNext}>
          {atLast ? "다 풀었어요" : "다음"}
          <ChevronRight size={15} />
        </Button>
      </div>
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
            {scopeName} {poolLength}문제 중에서 앞에서부터 가져옵니다
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
