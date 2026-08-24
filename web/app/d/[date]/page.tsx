import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import {
  ContinueCard,
  LaunchpadCard,
  NewsCard,
  ScheduleCard,
} from "@/components/cards";
import { getBriefing } from "@/lib/briefing/source";
import { formatKoreanDate, isISODate, todayISO } from "@/lib/date";

export default async function BriefingPage({
  params,
}: PageProps<"/d/[date]">) {
  const { date } = await params;

  // 형식이 깨진 주소는 진짜 404. "데이터가 없는 날"과는 다른 상황이다.
  if (!isISODate(date)) notFound();

  const [session, briefing] = await Promise.all([auth(), getBriefing(date)]);

  return (
    <AppShell dateLabel={formatKoreanDate(date)} userName={session?.user?.name}>
      {briefing ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{briefing.headline}</p>

          {/* PC 2단 · 모바일 1단. 카드는 그대로고 배치만 바뀐다. */}
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <NewsCard items={briefing.news} generatedAt={briefing.generatedAt} />

            <div className="flex flex-col gap-4">
              <ScheduleCard items={briefing.schedule} />
              <ContinueCard items={briefing.continues} />
            </div>

            <div className="lg:col-span-2">
              <LaunchpadCard items={briefing.launchpad} />
            </div>
          </div>
        </div>
      ) : (
        <EmptyBriefing date={date} />
      )}
    </AppShell>
  );
}

/**
 * 데이터가 없는 날. 아직 수집이 안 붙어서 대부분의 날짜가 여기로 오는데,
 * 404 를 주면 고장으로 오해된다.
 */
function EmptyBriefing({ date }: { date: string }) {
  const today = todayISO();

  return (
    <Card title="📭 브리핑 없음">
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">
          {formatKoreanDate(date)} 에는 아직 브리핑이 없습니다.
        </p>
        <p className="text-xs text-muted">
          수집과 요약은 다음 단계에서 붙습니다.
        </p>
        {date !== today ? (
          <Link
            href={`/d/${today}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
          >
            오늘로 가기 →
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
