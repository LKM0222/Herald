import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SecretStatus } from "@shared/types";
import { decrypt, encrypt, hasEncryptionKey } from "./crypto";

/**
 * 화면에서 넣는 자격증명.
 *
 * 저장은 반드시 crypto.ts 를 경유한다 (CLAUDE.md 절대 규칙 3).
 * 값은 **절대 화면으로 돌려보내지 않는다** — 설정돼 있는지와 끝 네 자리만 준다.
 * 확인용으로 전체를 보여주는 순간, 화면을 띄운 사람 아무나 키를 가져간다.
 */
const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const FILE = path.join(DATA_DIR, "secrets.json");

export type SecretName = SecretStatus["name"];
export type { SecretStatus };

/** 값이 형식에 맞는지 — 붙여넣기 사고를 여기서 잡는다. */
const RULES: Record<SecretName, { prefix: string; label: string }> = {
  anthropic: { prefix: "sk-ant-", label: "Anthropic API 키" },
};

type Stored = Partial<Record<SecretName, { value: string; updatedAt: string }>>;


function read(): Stored {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Stored;
  } catch {
    // 파일 없음 = 아직 아무것도 안 넣음. 오류가 아니라 상태다.
    return {};
  }
}

const ENV_FALLBACK: Record<SecretName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
};

/**
 * 실제로 쓸 값. 저장분이 우선이고 없으면 .env 를 본다 —
 * 화면에서 넣은 값이 파일 설정을 이겨야 "설정에서 바꿨는데 왜 안 먹지"가 안 생긴다.
 */
export function getSecret(name: SecretName): string | null {
  const packed = read()[name]?.value;
  if (packed) {
    const plain = decrypt(packed);
    if (plain) return plain;
    // 복호화 실패 = ENCRYPTION_KEY 가 바뀌었다. .env 로 떨어진다.
  }
  return process.env[ENV_FALLBACK[name]] || null;
}

export function statusOf(name: SecretName): SecretStatus {
  const entry = read()[name];
  const label = RULES[name].label;

  if (entry) {
    const plain = decrypt(entry.value);
    if (plain) {
      return {
        name,
        label,
        set: true,
        tail: plain.slice(-4),
        updatedAt: entry.updatedAt,
      };
    }
  }

  const fromEnv = process.env[ENV_FALLBACK[name]];
  if (fromEnv) {
    return { name, label, set: true, tail: fromEnv.slice(-4), fromEnv: true };
  }
  return { name, label, set: false };
}

export type SaveResult =
  | { ok: true }
  | { ok: false; error: "no_encryption_key" | "bad_format" };

export function setSecret(name: SecretName, value: string): SaveResult {
  // 키가 없으면 저장하지 않는다. 평문으로 떨어뜨리느니 거부한다.
  if (!hasEncryptionKey()) return { ok: false, error: "no_encryption_key" };

  const trimmed = value.trim();
  if (!trimmed.startsWith(RULES[name].prefix)) {
    return { ok: false, error: "bad_format" };
  }

  const next = read();
  next[name] = { value: encrypt(trimmed), updatedAt: new Date().toISOString() };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return { ok: true };
}

export function clearSecret(name: SecretName): void {
  const next = read();
  delete next[name];
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function allStatuses(): SecretStatus[] {
  return (Object.keys(RULES) as SecretName[]).map(statusOf);
}

export { hasEncryptionKey };
