import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * 비밀번호 로그인.
 *
 * 사람은 비밀번호를 기억하고, 매 요청의 인증은 발급된 토큰이 한다.
 * 비밀번호를 요청마다 보내지 않는 이유는 이 서버가 공개 인터넷에 있어서다 —
 * 사람이 외울 만한 비밀번호는 무차별 대입에 오래 못 버틴다.
 * 그래서 비밀번호는 로그인 한 번에만 쓰고, 그 지점에만 횟수 제한을 건다.
 *
 * 저장 위치는 도커 볼륨(/data)이다. .env 가 아닌 이유는 화면에서 바꿀 수
 * 있어야 하기 때문 — 앱이 자기 설정 파일을 고쳐 쓰는 건 곤란하다.
 */

const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const AUTH_FILE = path.join(DATA_DIR, "auth.json");

/** 로그인 토큰 유효기간. 개인 기기에 남는 값이라 길게 잡는다. */
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

type AuthFile = {
  salt: string;
  passwordHash: string;
  /** 토큰 서명용. 이 값을 갈면 발급된 토큰이 전부 무효가 된다 */
  tokenSecret: string;
  updatedAt: string;
};

function readAuth(): AuthFile | null {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf8")) as AuthFile;
  } catch {
    // 파일 없음 = 비밀번호 미설정. 오류가 아니라 상태다.
    return null;
  }
}

export function hasPassword(): boolean {
  return readAuth() !== null;
}

function hash(password: string, salt: string): string {
  // scrypt 는 메모리를 쓰게 만들어 GPU 대입을 비싸게 한다. 노드 내장이라 의존성도 없다.
  return scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
}

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function setPassword(password: string): void {
  const existing = readAuth();
  const salt = randomBytes(16).toString("hex");
  const next: AuthFile = {
    salt,
    passwordHash: hash(password, salt),
    // 비밀번호를 바꿔도 기존 기기는 살려둔다. 전부 끊고 싶으면 이 값을 갈면 된다.
    tokenSecret: existing?.tokenSecret ?? randomBytes(32).toString("hex"),
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function verifyPassword(password: string): boolean {
  const auth = readAuth();
  if (!auth) return false;
  return equals(hash(password, auth.salt), auth.passwordHash);
}

/** `<만료ms>.<서명>`. 상태를 서버에 두지 않아 재시작해도 살아 있다. */
export function issueToken(): string | null {
  const auth = readAuth();
  if (!auth) return null;
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${exp}.${sign(exp, auth.tokenSecret)}`;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyToken(token: string): boolean {
  const auth = readAuth();
  if (!auth) return false;
  const [exp, signature] = token.split(".");
  if (!exp || !signature) return false;
  if (!equals(sign(exp, auth.tokenSecret), signature)) return false;
  return Number(exp) > Date.now();
}
