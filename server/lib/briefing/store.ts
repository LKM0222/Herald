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

/**
 * 얼마나 보관할지.
 *
 * 지난 브리핑을 되돌아보는 화면이 아직 없어서 넉넉히 잡을 이유도 없지만,
 * 지우는 게 아까울 만큼 크지도 않다. 1년이면 "작년 이맘때" 가 남는다.
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
  try {
    return readdirSync(DIR)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function file(date: string): string {
  return path.join(DIR, `${date}.json`);
}

function prune(): void {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  for (const date of savedDates()) {
    if (date >= cutoff) continue;
    try {
      unlinkSync(file(date));
    } catch {
      /* 지우다 실패해도 오늘 브리핑은 이미 저장됐다. 다음에 다시 시도한다. */
    }
  }
}
