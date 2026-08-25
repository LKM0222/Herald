import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readSettings } from "../settings";
import { runBriefing } from "./run";

/**
 * 매일 정해진 시각에 브리핑을 만든다.
 *
 * 크론 패키지를 안 넣었다. 하루 한 번 도는 일에 의존성을 늘릴 이유가 없고,
 * 무엇보다 **설정이 실행 중에 바뀐다** — 사용자가 시각을 고치면 재시작 없이
 * 반영돼야 한다. 1분마다 깨어나 "지금이 그 시각인가" 를 묻는 쪽이 단순하다.
 *
 * 호스트 크론(crontab)도 쓰지 않았다. 그러면 시각이 컨테이너 밖에 있게 되어
 * 화면에서 고칠 수 없다. 설정에서 고른 값이 곧 실행 시각이어야 한다.
 *
 * ⚠ **이 파일이 토큰을 쓴다.** 그래서 settings.schedule.enabled 가 기본 꺼짐이고,
 *   켜져 있을 때만 runBriefing 까지 간다.
 */

const DATA_DIR = process.env.HERALD_DATA_DIR ?? "/data";
const FILE = path.join(DATA_DIR, "news-run.json");

/** 얼마나 자주 깨어나 확인할지. 1분이면 사용자가 고른 분 단위와 어긋나지 않는다. */
const TICK_MS = 60_000;

/**
 * 사용자가 고른 시각은 **한국 시간**이다. 컨테이너는 UTC 로 돈다.
 *
 * +9 를 더하는 대신 Intl 에 맡긴다. 한국은 서머타임이 없어 지금은 결과가 같지만,
 * 직접 계산하면 "왜 9인가" 가 코드에 안 남고 다른 지역으로 옮길 때 조용히 틀린다.
 */
const CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  /* hour12:false 만 주면 환경에 따라 자정이 "24:00" 으로 나온다(ICU 판마다 다르다).
     그러면 "24:00" >= "07:00" 이 되어 자정에 하루 치가 한 번 더 돈다.
     h23 은 00~23 을 못 박는다 — 시각 비교를 문자열로 하기 때문에 여기가 어긋나면 안 된다. */
  hourCycle: "h23",
});

let timer: ReturnType<typeof setInterval> | null = null;
/** 한 번에 하나만. 요약이 1분을 넘겨도 다음 tick 이 겹쳐 들어오지 않게 한다 */
let running = false;

/** 서버가 뜰 때 한 번 부른다 (instrumentation.ts). 두 번 불러도 안전하다. */
export function startScheduler(): void {
  if (timer) return;

  /* 처음 뜬 서버가 오늘 걸 소급해서 돌리지 않게 한다.
     기록이 없다는 건 "오늘 아직 안 돌았다" 가 아니라 "이 서버가 오늘을 모른다" 다.
     소급해서 돌리면 배포하자마자 예정에 없던 과금이 일어난다. */
  if (lastRun() === null) mark(now().date);

  timer = setInterval(() => void tick(), TICK_MS);
  // 이 타이머 때문에 프로세스가 안 죽는 일은 없어야 한다.
  timer.unref?.();
}

export function stopScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  if (running) return;

  const { schedule } = readSettings();
  if (!schedule.enabled) return;

  const { date, time } = now();
  if (lastRun() === date) return;
  /* 지난 시각이면 돈다. "정확히 그 분" 만 보면 그 순간 서버가 꺼져 있었을 때
     그날 브리핑이 영영 안 나온다 — 재시작 한 번에 하루를 잃는다. */
  if (time < schedule.at) return;

  running = true;
  try {
    /* 성공이든 실패든 오늘은 시도한 것으로 남긴다. 실패했다고 1분 뒤 다시
       부르면, 키가 잘못됐을 때 하루 종일 API 를 두드린다. */
    mark(date);
    const result = await runBriefing(date);
    if (result.ok) {
      console.log(
        `[herald] 브리핑 ${date} · ${result.count}건 · ` +
          `입력 ${result.usage.input} 출력 ${result.usage.output} 토큰 · ${result.ms}ms`,
      );
    } else {
      console.warn(`[herald] 브리핑 ${date} 실패: ${result.reason}`);
    }
  } catch (error) {
    console.error("[herald] 브리핑 중 예외", error);
  } finally {
    running = false;
  }
}

/** 한국 시간 기준의 오늘과 지금 시각. */
function now(): { date: string; time: string } {
  const parts = new Map(
    CLOCK.formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`,
    time: `${parts.get("hour")}:${parts.get("minute")}`,
  };
}

/**
 * 마지막으로 시도한 날.
 *
 * 파일에 두는 이유는 하나다 — **재시작해도 기억해야 한다.** 메모리에 두면
 * 배포할 때마다 그날 브리핑이 한 번 더 돈다. 배포는 하루에 여러 번 한다.
 */
function lastRun(): string | null {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as { date?: unknown };
    return typeof raw.date === "string" ? raw.date : null;
  } catch {
    return null;
  }
}

function mark(date: string): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify({ date }, null, 2));
  } catch (error) {
    /* 못 쓰면 다음 tick 에 또 돈다. 조용히 넘기면 1분마다 요약이 돈다 —
       이건 반드시 눈에 띄어야 하는 고장이다. */
    console.error("[herald] 실행 기록을 못 남겼다. 자동 실행을 멈춘다.", error);
    stopScheduler();
  }
}
