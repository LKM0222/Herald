import type { Area, NewsItem } from "@shared/types";
import { readSettings } from "../settings";
import { collect, type SourceReport } from "./collect";
import type { OriginReport } from "./origin";
import { loadSummarized } from "./seen";

/**
 * 요약할 기사 목록.
 *
 * 수집(collect) 과 기록(seen) 을 잇는 얇은 층이다. 요약 단계는 이 함수만
 * 부르면 되고, "무엇을 어디서 가져왔나" 와 "무엇을 이미 했나" 를 몰라도 된다.
 *
 * ⚠ 여기까지도 **토큰을 쓰지 않는다.** 실제 호출은 다음 단계 몫이다.
 */

/** 하루 한 번 보내는데 창은 48시간. 한 번 걸러도 그날 기사가 안 사라진다. */
const WINDOW_HOURS = 48;

/**
 * 오래 꺼져 있다 켰을 때의 상한.
 * 2주 만에 켰다고 300건을 한 브리핑에 쏟으면 그건 브리핑이 아니다.
 */
const MAX_CATCHUP_HOURS = 72;

export type PendingResult = {
  /** 요약해야 할 것. 최신순 */
  items: NewsItem[];
  /** 소스별 수집 상황. 왜 비었는지가 보여야 한다 */
  reports: SourceReport[];
  /** 영역별 건수. 이미 요약한 것을 뺀 뒤의 값이다 */
  byArea: Record<Area, number>;
  /** 다른 영역이 이미 가져가서 뺀 건수 */
  crossArea: number;
  /** 이미 요약해서 뺀 건수 */
  skipped: number;
  /** 영역 상한에 걸려 버린 건수 */
  dropped: number;
  /** 같은 기사라 합친 건수 */
  merged: number;
  /** 원본 주소 복원 결과 */
  origins: OriginReport;
  hours: number;
};

export type PendingOptions = {
  /** 안 주면 설정에서 읽는다 */
  enabled?: string[];
  /** 안 주면 48시간 */
  hours?: number;
  /** 이미 요약한 것도 그대로 담는다. 프롬프트를 시험할 때 쓴다 */
  includeSummarized?: boolean;
};

export async function pending(
  options: PendingOptions = {},
): Promise<PendingResult> {
  const enabled = options.enabled ?? readSettings().enabledSources;
  const hours = Math.min(options.hours ?? WINDOW_HOURS, MAX_CATCHUP_HOURS);

  const { items, reports, byArea, crossArea, dropped, merged, origins } =
    await collect({ enabled, hours });

  if (options.includeSummarized) {
    return { items, reports, byArea, crossArea, skipped: 0, dropped, merged, origins, hours };
  }

  const done = loadSummarized();
  const fresh = items.filter((item) => !done.has(item.id));

  return {
    items: fresh,
    reports,
    // 걸러낸 뒤로 다시 센다. 수집 시점 값을 그대로 두면 "오늘 경제 25건" 인데
    // 화면엔 3건만 뜨는 이유가 안 보인다 — 나머지는 어제 이미 요약한 것들이다.
    byArea: tally(fresh),
    crossArea,
    skipped: items.length - fresh.length,
    dropped,
    merged,
    origins,
    hours,
  };
}

function tally(items: NewsItem[]): Record<Area, number> {
  const out = { dev: 0, game: 0, finance: 0, general: 0 };
  for (const item of items) out[item.area ?? "dev"] += 1;
  return out;
}
