import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  QuizAttempt,
  QuizGrade,
  QuizSession,
  QuizSessionSummary,
} from "@shared/types";

/**
 * 문제 풀기 기록.
 *
 * 설정과 같은 자리(도커 볼륨 /data)에 JSON 한 장으로 둔다. 한 사람이 하루에
 * 몇 판 푸는 정도라 인덱스도 동시성 제어도 필요 없다 — SQLite 를 끌어오면
 * 이 기능 하나 때문에 서버에 마이그레이션 절차가 생긴다.
 */
const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const FILE = path.join(DATA_DIR, "quiz-sessions.json");

/**
 * 오래된 판부터 버린다. 무한히 쌓이면 목록 응답이 계속 커지는데, 화면에서
 * 실제로 거슬러 보는 건 최근 몇 판이다.
 */
const KEEP = 200;

/** 판마다 뽑을 수 있는 최대 문제 수(문제집 전체)보다 넉넉히 잡는다. */
const MAX_ATTEMPTS = 500;

function readAll(): QuizSession[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(isSession);
  } catch {
    // 파일 없음 = 아직 한 판도 안 풀었다.
    return [];
  }
}

function isSession(value: unknown): value is QuizSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<QuizSession>;
  return (
    typeof v.id === "string" &&
    typeof v.startedAt === "string" &&
    Array.isArray(v.attempts)
  );
}

function isGrade(value: unknown): value is QuizGrade {
  return value === "correct" || value === "wrong";
}

/**
 * 화면에서 온 값은 전부 여기를 지난다. 서버가 저장하는 모양을 서버가 정한다 —
 * 클라이언트가 보낸 것을 그대로 쓰면 파일이 무엇이든 담는 통이 된다.
 */
export function cleanSession(raw: unknown): QuizSession | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<QuizSession>;

  if (typeof v.id !== "string" || v.id.length === 0 || v.id.length > 100) {
    return null;
  }
  if (!Array.isArray(v.attempts) || v.attempts.length === 0) return null;

  const attempts: QuizAttempt[] = [];
  for (const item of v.attempts.slice(0, MAX_ATTEMPTS)) {
    if (!item || typeof item !== "object") continue;
    const a = item as Partial<QuizAttempt>;
    if (typeof a.id !== "string" || typeof a.no !== "number") continue;
    attempts.push({
      id: a.id.slice(0, 40),
      no: a.no,
      title: typeof a.title === "string" ? a.title.slice(0, 200) : "",
      grade: isGrade(a.grade) ? a.grade : null,
    });
  }
  if (attempts.length === 0) return null;

  const now = new Date().toISOString();
  return {
    id: v.id,
    // 시각은 화면 말을 믿되, 없거나 깨졌으면 서버 시계로 채운다.
    startedAt: isISOTime(v.startedAt) ? v.startedAt : now,
    updatedAt: now,
    scope: typeof v.scope === "string" ? v.scope.slice(0, 60) : "전체",
    attempts,
  };
}

function isISOTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * 같은 id 면 덮어쓴다.
 *
 * 화면은 한 문제 채점할 때마다 판 전체를 다시 보낸다. 부분 갱신으로 두면
 * "3번 문제의 채점만 바꿔라" 같은 요청이 필요해지고, 중간에 한 번 실패하면
 * 서버와 화면이 서로 다른 판을 들게 된다. 통째로 보내면 마지막 요청이 곧 진실이다.
 */
export function saveSession(session: QuizSession): QuizSession {
  const all = readAll().filter((s) => s.id !== session.id);
  all.push(session);

  // 최근 것이 뒤로 가도록 정렬해 두고 앞에서 잘라낸다.
  all.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const kept = all.slice(-KEEP);

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(kept, null, 2));
  return session;
}

export function findSession(id: string): QuizSession | null {
  return readAll().find((s) => s.id === id) ?? null;
}

/** 최근 판이 위로 오게 돌려준다. */
export function listSummaries(): QuizSessionSummary[] {
  return readAll()
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      scope: s.scope,
      total: s.attempts.length,
      correct: s.attempts.filter((a) => a.grade === "correct").length,
      wrong: s.attempts.filter((a) => a.grade === "wrong").length,
      ungraded: s.attempts.filter((a) => a.grade === null).length,
    }));
}
