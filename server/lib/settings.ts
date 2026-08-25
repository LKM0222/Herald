import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATALOG, DEFAULT_ENABLED } from "@shared/sources";
import type { NewsSchedule } from "@shared/types";

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
  /** 매일 언제 요약을 돌릴지. 기본은 꺼짐 */
  schedule: NewsSchedule;
};

/**
 * 자동 실행의 기본값.
 *
 * ⚠ **enabled 를 true 로 바꾸지 마라.** 이 값 하나가 "사용자가 켜지 않아도
 *   매일 아침 API 를 호출한다" 를 뜻한다. 07:00 은 켰을 때의 시작점일 뿐이다.
 */
const DEFAULT_SCHEDULE: NewsSchedule = { enabled: false, at: "07:00" };

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
    return { enabledSources: enabled, schedule: cleanSchedule(raw.schedule) };
  } catch {
    // 파일 없음 = 아직 손대지 않음. 기본값으로 시작한다.
    return { enabledSources: DEFAULT_ENABLED, schedule: DEFAULT_SCHEDULE };
  }
}

export function writeSettings(next: Settings): Settings {
  const enabledSources = [...new Set(next.enabledSources)].filter((id) =>
    KNOWN.has(id),
  );
  mkdirSync(DATA_DIR, { recursive: true });
  const saved: Settings = {
    enabledSources,
    schedule: cleanSchedule(next.schedule),
  };
  writeFileSync(FILE, JSON.stringify(saved, null, 2));
  return saved;
}

/**
 * 저장된 값도, 화면에서 온 값도 여기를 지난다.
 *
 * 시각이 깨져 있으면 **끄는 게 아니라 기본 시각으로 되돌린다.** 조용히 꺼버리면
 * 사용자는 켜둔 줄 알고 며칠을 기다린다. 시계가 틀린 것과 알람이 꺼진 것은 다르다.
 */
function cleanSchedule(raw: unknown): NewsSchedule {
  if (!raw || typeof raw !== "object") return DEFAULT_SCHEDULE;
  const value = raw as Partial<NewsSchedule>;
  return {
    enabled: value.enabled === true,
    at: isTime(value.at) ? value.at : DEFAULT_SCHEDULE.at,
  };
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
