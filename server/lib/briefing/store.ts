import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Briefing } from "@shared/types";

/**
 * 만들어진 브리핑을 날짜별로 보관한다.
 *
 * DB 를 안 쓴다. 하루 한 건, 한 사람이 본다 — 파일 하나가 딱 맞는 크기다.
 * 실측으로 한 건이 대략 60~80KB 라 1년을 모아도 30MB 가 안 된다.
 *
 * ★ 이 파일이 있어야 자동 실행이 의미가 있다. 저장할 곳이 없으면 매일 아침
 *   토큰을 써서 요약해 놓고 그대로 버리게 된다.
 */

const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const DIR = path.join(DATA_DIR, "briefings");
/** 요약에 **들어간** 것. 요약 결과와 따로 둔다 — 아래 saveArchive 참고 */
const ARCHIVE_DIR = path.join(DATA_DIR, "archive");

/**
 * 얼마나 보관할지.
 *
 * 지난 브리핑을 되돌아보는 화면이 아직 없어서 넉넉히 잡을 이유도 없지만,
 * 지우는 게 아까울 만큼 크지도 않다. 1년이면 "작년 이맘때" 가 남는다.
 *
 * 크기는 재봤다 — 수집 원문이 하루 약 50KB, 크롤링한 원문을 더해도 100KB 언저리다.
 * 1년치가 40MB 를 안 넘는다. 오라클 무료 티어에서도 신경 쓸 크기가 아니다.
 */
const KEEP_DAYS = 365;

export function saveBriefing(briefing: Briefing): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file(briefing.date), JSON.stringify(briefing, null, 2));
  prune();
}

export function loadBriefing(date: string): Briefing | null {
  try {
    return JSON.parse(readFileSync(file(date), "utf8")) as Briefing;
  } catch {
    // 그날 것이 없는 건 오류가 아니다. 아직 안 돌았거나 꺼져 있었던 것이다.
    return null;
  }
}

/** 저장된 날짜들. 최신순. */
export function savedDates(): string[] {
  return datesIn(DIR);
}

function datesIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * 요약에 **들어간** 재료. 결과(브리핑)와 파일을 나눠 둔다.
 *
 * 왜 나누나 — 브리핑은 화면이 열릴 때마다 읽는다. 실측으로 수집 원문이 50KB 라
 * 한 파일에 합치면 그 50KB 를 매번 같이 읽고 같이 내려보낸다. 화면은 요약만
 * 필요하다.
 *
 * 왜 남기나 — 세 가지가 이 파일에만 있다:
 *   · 모델이 **무엇을 보고** 그렇게 판단했는지. 브리핑이 이상할 때 여기부터 본다
 *   · 그날 실제로 쓴 토큰. 청구서와 맞춰 볼 근거다
 *   · 먼저 볼 것의 크롤링한 원문. 이게 있으면 **다시 긁지 않고** 프롬프트만
 *     바꿔 요약을 재현할 수 있다
 *
 * 두 번 쓴다. 요약 전에 수집분을 먼저 남기고, 끝난 뒤 원문과 토큰을 덧붙인다.
 * 요약이 실패한 날에도 "무엇을 모았는지" 는 남아야 원인을 찾는다.
 */
export function saveArchive(date: string, patch: Record<string, unknown>): void {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const before = loadArchive(date) ?? {};
  writeFileSync(
    archiveFile(date),
    JSON.stringify({ ...before, date, ...patch }, null, 2),
  );
}

export function loadArchive(date: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(archiveFile(date), "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function file(date: string): string {
  return path.join(DIR, `${date}.json`);
}

function archiveFile(date: string): string {
  return path.join(ARCHIVE_DIR, `${date}.json`);
}

function prune(): void {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // 요약 결과와 재료를 같은 기준으로 턴다. 한쪽만 남으면 짝이 안 맞아 헷갈린다.
  for (const [dir, at] of [
    [DIR, file],
    [ARCHIVE_DIR, archiveFile],
  ] as const) {
    for (const date of datesIn(dir)) {
      if (date >= cutoff) continue;
      try {
        unlinkSync(at(date));
      } catch {
        /* 지우다 실패해도 오늘 것은 이미 저장됐다. 다음에 다시 시도한다. */
      }
    }
  }
}
