import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * 자격증명 대칭 암호화 (AES-256-GCM).
 *
 * 해시가 아니라 암호화인 이유: 이 값들은 **복호화해서 써야 한다**.
 * API 키를 앤트로픽에 보내야 하고, 네이버 앱 비밀번호를 CalDAV 에 실어야 한다.
 * 비밀번호(auth.ts)와는 용도가 정반대라 다른 파일에 둔다 — 섞으면 언젠가
 * 잘못된 쪽을 쓴다.
 *
 * GCM 을 쓰는 이유는 인증 태그가 붙어서다. 저장 파일이 손상되거나 조작되면
 * 복호화가 조용히 쓰레기를 내는 대신 실패한다.
 *
 * ⚠ ENCRYPTION_KEY 가 없으면 암호화를 하지 않는다. 평문으로 떨어뜨리지 않고
 *   던진다 — 설정 누락이 평문 저장이 되면 규칙을 어긴 것이다.
 */

const ALGORITHM = "aes-256-gcm";

export class MissingEncryptionKey extends Error {
  constructor() {
    super("ENCRYPTION_KEY 가 설정되지 않았습니다");
    this.name = "MissingEncryptionKey";
  }
}

export function hasEncryptionKey(): boolean {
  return (process.env.ENCRYPTION_KEY ?? "").length > 0;
}

/**
 * 환경변수 문자열에서 32바이트 키를 만든다.
 * 사람이 어떤 길이로 넣든 받아주되, 솔트를 고정해 같은 값이 같은 키가 되게 한다 —
 * 솔트를 랜덤으로 두면 재시작할 때마다 기존 저장분을 못 읽는다.
 */
function derive(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? "";
  if (!secret) throw new MissingEncryptionKey();
  return scryptSync(secret, "herald.credentials.v1", 32);
}

/** `<iv>.<태그>.<암호문>` — 전부 base64url. 한 문자열로 저장한다. */
export function encrypt(plain: string): string {
  const key = derive();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/** 복호화 실패는 null 로 돌려준다 — 키를 바꿨거나 파일이 상한 경우다. */
export function decrypt(packed: string): string | null {
  try {
    const [iv, tag, body] = packed.split(".");
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv(
      ALGORITHM,
      derive(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return (
      decipher.update(Buffer.from(body, "base64url")).toString("utf8") +
      decipher.final("utf8")
    );
  } catch {
    return null;
  }
}
