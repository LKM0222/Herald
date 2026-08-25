import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { CalendarSubscription } from "@shared/types";
import { decrypt, encrypt, hasEncryptionKey } from "../crypto";

/**
 * 등록해 둔 캘린더 주소들.
 *
 * publishedKey 는 **자격증명이다.** 그 키만 있으면 로그인 없이 일정 전체를
 * 읽을 수 있다 — 비밀번호와 다를 게 없다. 그래서 secrets.ts 와 같은 규칙을 쓴다:
 * 저장은 반드시 crypto.ts 를 경유하고(CLAUDE.md 절대 규칙 3), 키가 없으면
 * 평문으로 떨어뜨리는 대신 **저장을 거부한다.**
 *
 * 값은 화면으로 돌려보내지 않는다. 이름과 소유 계정만 준다.
 */

const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const FILE = path.join(DATA_DIR, "calendars.json");

/** 하나가 잘못돼도 나머지는 살아야 해서 항목마다 따로 암호화한다. */
type Stored = {
  id: string;
  label: string;
  owner: string;
  /** 암호화된 publishedKey */
  key: string;
  addedAt: string;
}[];

function read(): Stored {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Stored) : [];
  } catch {
    // 파일 없음 = 아직 아무것도 안 넣음. 오류가 아니라 상태다.
    return [];
  }
}

function write(next: Stored): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

/** 화면에 보여줄 목록. 키는 빠진다. */
export function list(): CalendarSubscription[] {
  return read().map(({ id, label, owner, addedAt }) => ({
    id,
    label,
    owner,
    addedAt,
  }));
}

/** 조회할 때 쓸 목록. 서버 안에서만 돈다. */
export function usable(): { id: string; label: string; key: string }[] {
  const out: { id: string; label: string; key: string }[] = [];
  for (const entry of read()) {
    const key = decrypt(entry.key);
    // 복호화 실패 = ENCRYPTION_KEY 가 바뀌었다. 조용히 건너뛰지 않고 남긴다.
    if (key) out.push({ id: entry.id, label: entry.label, key });
    else console.error(`[herald] 캘린더 키를 복호화하지 못했어요: ${entry.id}`);
  }
  return out;
}

export type AddResult =
  | { ok: true; subscriptions: CalendarSubscription[] }
  | { ok: false; error: "no_encryption_key" | "duplicate" };

export function add(input: {
  key: string;
  label: string;
  owner: string;
}): AddResult {
  // 키가 없으면 저장하지 않는다. 평문으로 떨어뜨리느니 거부한다.
  if (!hasEncryptionKey()) return { ok: false, error: "no_encryption_key" };

  const current = read();
  // 같은 캘린더를 두 번 넣으면 일정이 두 벌로 보인다.
  if (current.some((entry) => decrypt(entry.key) === input.key)) {
    return { ok: false, error: "duplicate" };
  }

  current.push({
    id: randomUUID(),
    label: input.label,
    owner: input.owner,
    key: encrypt(input.key),
    addedAt: new Date().toISOString(),
  });
  write(current);
  return { ok: true, subscriptions: list() };
}

export function remove(id: string): CalendarSubscription[] {
  write(read().filter((entry) => entry.id !== id));
  return list();
}

export { hasEncryptionKey };
