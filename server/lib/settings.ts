import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATALOG, DEFAULT_ENABLED } from "@shared/sources";

/**
 * 사용자가 화면에서 바꾸는 설정.
 *
 * .env 가 아니라 도커 볼륨(/data)에 둔다 — 앱이 자기 설정 파일을 고쳐 쓰면
 * 배포할 때마다 충돌한다. .env 는 시크릿 전용으로 남긴다.
 */
const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const FILE = path.join(DATA_DIR, "settings.json");

export type Settings = {
  /** 수집할 소스 id 목록 */
  enabledSources: string[];
};

// CATALOG 가 as const 라 id 가 리터럴 유니온으로 좁혀진다. 들어오는 값은 임의의
// 문자열이므로 Set<string> 으로 넓혀 둔다 — 걸러내는 게 이 Set 의 일이다.
const KNOWN: Set<string> = new Set(CATALOG.map((source) => source.id));

export function readSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Settings>;
    const enabled = Array.isArray(raw.enabledSources)
      ? // 목록에서 사라진 소스 id 가 남아 있을 수 있다. 저장할 때가 아니라
        // 읽을 때 거른다 — 카탈로그는 코드라서 배포로 바뀐다.
        raw.enabledSources.filter((id) => KNOWN.has(id))
      : DEFAULT_ENABLED;
    return { enabledSources: enabled };
  } catch {
    // 파일 없음 = 아직 손대지 않음. 기본값으로 시작한다.
    return { enabledSources: DEFAULT_ENABLED };
  }
}

export function writeSettings(next: Settings): Settings {
  const enabledSources = [...new Set(next.enabledSources)].filter((id) =>
    KNOWN.has(id),
  );
  mkdirSync(DATA_DIR, { recursive: true });
  const saved: Settings = { enabledSources };
  writeFileSync(FILE, JSON.stringify(saved, null, 2));
  return saved;
}
