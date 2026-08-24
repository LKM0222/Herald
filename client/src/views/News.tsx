import { formatKoreanDate } from "@shared/date";
import type { Briefing } from "@shared/types";
import { NewsCard } from "../components/NewsCard";
import { hrefFor } from "../lib/views";

export function News({
  briefing,
  date,
  today,
}: {
  briefing: Briefing;
  date: string;
  today: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">{briefing.headline}</p>
        {date !== today ? (
          <a
            href={hrefFor("news", today)}
            className="text-xs text-accent hover:underline"
          >
            오늘로 가기 →
          </a>
        ) : null}
      </div>

      <NewsCard
        items={briefing.news}
        generatedAt={briefing.generatedAt}
        sample={briefing.sample}
      />

      <p className="text-xs text-muted">{formatKoreanDate(date)} 브리핑</p>
    </div>
  );
}
