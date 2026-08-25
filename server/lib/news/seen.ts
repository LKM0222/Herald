import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * 이미 요약한 기사 기록.
 *
 * 이게 있어서 수집 창을 48시간으로 넓혀도 토큰이 안 늘어난다 —
 * 24~48시간 구간은 어제 요약한 것들이라 전부 걸러진다. 대신 하루를 걸러도
 * 그날 기사가 사라지지 않는다. 창을 24시간으로 좁게 잡으면 놓친 날은 영영 못 본다.
 *
 * 열쇠는 collect.ts 의 id 다 — 주소를 정규화해 해싱하므로 날마다 안 바뀐다.
 * id 가 흔들리면 이 파일은 아무것도 못 막는다.
 */

const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const FILE = path.join(DATA_DIR, "news-seen.json");

/** 기록을 남겨둘 기간. 창(48시간)보다 훨씬 길게 잡는다 — 피드에 오래 남는 글이 있다. */
const KEEP_DAYS = 30;

/** id → 요약한 날 (YYYY-MM-DD) */
type Stored = Record<string, string>;

function read(): Stored {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    // 배열이나 잡값이 들어와도 통째로 버리지 않고 빈 기록으로 시작한다.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Stored)
      : {};
  } catch {
    // 파일 없음 = 아직 한 번도 요약 안 함. 오류가 아니라 상태다.
    return {};
  }
}

/** 요약을 끝낸 것만 넣는다. 수집했다고 넣으면 요약 전에 걸러져 영영 안 나온다. */
export function markSummarized(ids: string[], date: string): void {
  if (ids.length === 0) return;
  const next = read();
  for (const id of ids) next[id] = date;
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(prune(next), null, 2));
}

export function loadSummarized(): Set<string> {
  return new Set(Object.keys(read()));
}

/** 오래된 기록을 턴다. 안 털면 이 파일만 계속 자란다. */
function prune(stored: Stored): Stored {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const out: Stored = {};
  for (const [id, date] of Object.entries(stored)) {
    if (date >= cutoff) out[id] = date;
  }
  return out;
}
