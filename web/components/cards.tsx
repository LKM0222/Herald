import { Card, PendingButton } from "./Card";
import type {
  ContinueItem,
  LaunchItem,
  NewsItem,
  ScheduleItem,
} from "@/lib/briefing/types";

export function NewsCard({
  items,
  generatedAt,
}: {
  items: NewsItem[];
  generatedAt: string | null;
}) {
  // 카테고리는 요약 단계에서 붙는 값이라 개수·이름이 고정돼 있지 않다. 등장 순서대로 묶는다.
  const byCategory = new Map<string, NewsItem[]>();
  for (const item of items) {
    const bucket = byCategory.get(item.category) ?? [];
    bucket.push(item);
    byCategory.set(item.category, bucket);
  }

  return (
    <Card
      title="📰 오늘 볼 것"
      meta={generatedAt ? `요약 ${generatedAt}` : "요약 전"}
    >
      <div className="flex flex-col gap-4">
        {[...byCategory].map(([category, group]) => (
          <div key={category}>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted">
              {category}
            </h3>
            <ul className="flex flex-col gap-3">
              {group.map((item) => (
                <li key={item.id} className="flex flex-col gap-1.5">
                  <p className="text-sm leading-snug">{item.title}</p>
                  {item.flagged ? (
                    <p className="text-xs text-accent">⚠ {item.flagReason}</p>
                  ) : null}
                  <div className="flex gap-1.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="원문 열기"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-2 text-xs hover:border-accent hover:text-accent"
                    >
                      🔗
                    </a>
                    <PendingButton title="담아두기">📌</PendingButton>
                    <PendingButton title="Claude 로 조사">🔍</PendingButton>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ScheduleCard({ items }: { items: ScheduleItem[] }) {
  return (
    <Card title="📅 오늘 일정">
      {items.length === 0 ? (
        <p className="text-sm text-muted">일정 없음</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 text-sm">
              <span className="tabular-nums text-muted">{item.time}</span>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ContinueCard({ items }: { items: ContinueItem[] }) {
  return (
    <Card title="🧠 이어가기">
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.project} className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{item.project}</p>
            <p className="text-xs text-muted">어제 · {item.yesterday}</p>
            <p className="text-sm">다음 · {item.next}</p>
            <div className="mt-1">
              <PendingButton title="세션 열고 이어가기">⚡ 이어서</PendingButton>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function LaunchpadCard({ items }: { items: LaunchItem[] }) {
  return (
    <Card title="🚀 런치패드" meta="핸들러 미설치">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <PendingButton key={item.id} title={item.label}>
            {item.icon} {item.label}
          </PendingButton>
        ))}
      </div>
    </Card>
  );
}
