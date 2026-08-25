import type { Briefing } from "@shared/types";
import { saveBriefing } from "../briefing/store";
import { pending } from "./pending";
import { markSummarized } from "./seen";
import { summarize, type Usage } from "./summarize";

/**
 * 하루치 브리핑을 한 번 만든다. **토큰을 쓰는 유일한 자동 경로다.**
 *
 * 수집 → 요약 → 저장 → 기록. 네 단계가 한 함수에 있는 이유는 순서가 틀리면
 * 조용히 망가지기 때문이다:
 *
 *   · 저장보다 기록(markSummarized)이 먼저면, 저장이 실패했을 때 그 기사들이
 *     "이미 요약함" 으로 남아 내일 다시 안 나온다. **하루가 통째로 사라진다.**
 *   · 요약이 실패하면 아무것도 기록하지 않는다. 내일 다시 시도해야 한다.
 *
 * 부르는 곳은 둘이다 — scheduler.ts(매일 정해진 시각)와 손으로 부르는 스크립트.
 */

export type RunResult =
  | {
      ok: true;
      date: string;
      /** 요약한 기사 수 */
      count: number;
      /** 실제로 쓴 토큰. 추정이 아니다 */
      usage: Usage;
      notes: string[];
      ms: number;
    }
  | { ok: false; reason: string; ms: number };

export async function runBriefing(date: string): Promise<RunResult> {
  const started = Date.now();

  const { items } = await pending();
  if (items.length === 0) {
    // 새 기사가 없다. 호출하지 않는다 — 빈 목록에 토큰을 쓸 이유가 없다.
    return { ok: false, reason: "새로 요약할 기사가 없습니다", ms: Date.now() - started };
  }

  const result = await summarize(items);
  if (!result.ok) {
    return { ok: false, reason: result.message, ms: Date.now() - started };
  }

  const briefing: Briefing = {
    date,
    generatedAt: new Date().toISOString(),
    headline: result.headline,
    news: result.news,
    /* 캘린더에서 오는 것들은 비워 둔다. 화면은 이미 /api/calendar/events 로
       그때그때 받아온다 — 여기 굳이 박제하면 일정이 바뀌어도 안 따라간다. */
    schedule: [],
    upcoming: [],
    week: [],
    continues: [],
    launchpad: [],
  };

  // 저장이 먼저다. 이게 실패하면 기록도 안 남아서 내일 다시 시도한다.
  saveBriefing(briefing);
  markSummarized(
    result.news.map((item) => item.id),
    date,
  );

  return {
    ok: true,
    date,
    count: result.news.length,
    usage: result.usage,
    notes: result.notes,
    ms: Date.now() - started,
  };
}
