import type { Briefing } from "@shared/types";
import { Card } from "../components/Card";
import { ContinueCard, LaunchpadCard, ScheduleCard } from "../components/cards";
import { hrefFor } from "../lib/views";

/**
 * 하루를 여는 화면.
 *
 * 기사 본문은 뉴스 탭에 있고 여기엔 "몇 건인지"만 둔다 —
 * 홈에서 바로 스크롤이 시작되면 일정과 런치패드가 아래로 밀려난다.
 */
export function Home({
  briefing,
  date,
}: {
  briefing: Briefing;
  /** 오늘이면 생략한다 — 링크에 불필요한 ?d= 를 붙이지 않기 위해 */
  date?: string;
}) {
  const leadCount = briefing.news.filter((item) => item.priority === 1).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{briefing.headline}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="📰 오늘의 뉴스"
          meta={briefing.sample ? "샘플" : `${briefing.news.length}건`}
        >
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm">
              {briefing.news.length === 0
                ? "모인 기사가 없습니다."
                : leadCount > 0
                  ? `${briefing.news.length}건 중 ${leadCount}건이 먼저 볼 것으로 분류됐습니다.`
                  : `${briefing.news.length}건이 모였습니다.`}
            </p>
            <a
              href={hrefFor("news", date)}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
            >
              뉴스 보기 →
            </a>
          </div>
        </Card>

        <ScheduleCard items={briefing.schedule} />
        <ContinueCard items={briefing.continues} />
        <LaunchpadCard items={briefing.launchpad} />
      </div>
    </div>
  );
}
