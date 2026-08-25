import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SecretName, SecretStatus } from "@shared/types";
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

export type { SecretName, SecretStatus };

/**
 * prefix 가 있으면 붙여넣기 사고를 여기서 잡는다.
 * 네이버 앱 비밀번호는 정해진 모양이 없어서 검사하지 않는다 —
 * 형식을 지어내 막으면 멀쩡한 값을 거부하게 된다.
 */
const RULES: Record<SecretName, { prefix?: string; label: string }> = {
  anthropic: { prefix: "sk-ant-", label: "Anthropic API 키" },
  naver_id: { label: "네이버 아이디" },
  naver_password: { label: "네이버 앱 비밀번호" },
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
  naver_id: "NAVER_ID",
  naver_password: "NAVER_APP_PASSWORD",
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
        tail: hint(name, plain),
        updatedAt: entry.updatedAt,
      };
    }
  }

  const fromEnv = process.env[ENV_FALLBACK[name]];
  if (fromEnv) {
    return { name, label, set: true, tail: hint(name, fromEnv), fromEnv: true };
  }
  return { name, label, set: false };
}

/**
 * 화면에 보여줄 힌트.
 * 비밀은 끝 네 자리만, 아이디는 통째로 — 아이디는 숨길 값이 아니고
 * 끝 네 자리만 보여주면 어느 계정인지 알 수가 없다.
 */
function hint(name: SecretName, plain: string): string {
  return name === "naver_id" ? plain : plain.slice(-4);
}

export type SaveResult =
  | { ok: true }
  | { ok: false; error: "no_encryption_key" | "bad_format" };

export function setSecret(name: SecretName, value: string): SaveResult {
  // 키가 없으면 저장하지 않는다. 평문으로 떨어뜨리느니 거부한다.
  if (!hasEncryptionKey()) return { ok: false, error: "no_encryption_key" };

  const trimmed = value.trim();
  const prefix = RULES[name].prefix;
  if (prefix && !trimmed.startsWith(prefix)) {
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
