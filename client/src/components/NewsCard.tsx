import { formatRelative } from "@shared/date";
import type { NewsItem, Priority } from "@shared/types";
import { Card, PendingButton } from "./Card";

/**
 * 뉴스는 중요도로 3층을 이룬다.
 *
 * 20건을 평평하게 늘어놓으면 아무것도 안 읽는다. 그래서 층마다 밀도를 바꾼다 —
 * 1층은 요약과 근거를 펼치고, 2층은 한 줄, 3층은 접어둔다.
 * 주제별로 묶지 않는 이유: 아침에 필요한 건 분류가 아니라 순서다.
 */
const TIERS: { priority: Priority; label: string; hint: string }[] = [
  { priority: 1, label: "★ 먼저 볼 것", hint: "" },
  { priority: 2, label: "훑어볼 것", hint: "" },
  { priority: 3, label: "참고", hint: "접힘" },
];

export function NewsCard({
  items,
  generatedAt,
  sample,
}: {
  items: NewsItem[];
  generatedAt: string | null;
  sample?: boolean;
}) {
  const tiers = TIERS.map((tier) => ({
    ...tier,
    // priority 가 없는 항목(수집만 되고 요약 전)은 맨 아래로 보낸다.
    items: items.filter((item) => (item.priority ?? 3) === tier.priority),
  })).filter((tier) => tier.items.length > 0);

  return (
    <Card
      title="📰 오늘 볼 것"
      meta={
        sample ? (
          <span className="rounded-md border border-accent/40 px-1.5 py-0.5 text-accent">
            샘플
          </span>
        ) : generatedAt ? (
          `요약 ${generatedAt}`
        ) : (
          "요약 전"
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">오늘 모인 기사가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {tiers.map((tier) =>
            tier.priority === 3 ? (
              <details key={tier.priority} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium text-muted">
                  <span className="transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  {tier.label} ({tier.items.length}건)
                </summary>
                <ul className="mt-2 flex flex-col">
                  {tier.items.map((item) => (
                    <CompactRow key={item.id} item={item} />
                  ))}
                </ul>
              </details>
            ) : (
              <section key={tier.priority}>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted">
                  {tier.label}
                </h3>
                {tier.priority === 1 ? (
                  <div className="flex flex-col gap-3">
                    {tier.items.map((item) => (
                      <LeadItem key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {tier.items.map((item) => (
                      <CompactRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </section>
            ),
          )}
        </div>
      )}
    </Card>
  );
}

/** 1층 — 요약이 제목 자리를 차지하고, 왜 중요한지를 함께 편다. */
function LeadItem({ item }: { item: NewsItem }) {
  return (
    <article className="rounded-lg border border-border p-3">
      <p className="text-[15px] font-medium leading-snug">
        {item.summary ?? item.title}
      </p>

      {item.relevance ? (
        <p className="mt-2 border-l-2 border-accent pl-2.5 text-xs leading-relaxed text-accent">
          {item.relevance}
        </p>
      ) : null}

      {/* 원제는 요약이 있을 때만, 작게. 요약이 곡해됐는지 확인할 근거로 남긴다 */}
      {item.summary ? (
        <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted">
          {item.title}
        </p>
      ) : null}

      <Meta item={item} />

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <SourceLink url={item.url} label="원문 열기" />
        <PendingButton title="담아두기">📌</PendingButton>
        <PendingButton title="Claude 로 조사">🔍</PendingButton>
      </div>
    </article>
  );
}

/**
 * 2·3층 — 한 줄. 행 전체가 링크라 모바일에서 조준할 필요가 없다.
 * 세로 여백으로 44px 터치 높이를 만든다.
 */
function CompactRow({ item }: { item: NewsItem }) {
  return (
    <li className="border-b border-border last:border-0">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex min-h-11 flex-col justify-center gap-0.5 py-2 hover:text-accent"
      >
        <span className="text-sm leading-snug">{item.summary ?? item.title}</span>
        <Meta item={item} />
      </a>
    </li>
  );
}

function Meta({ item }: { item: NewsItem }) {
  const extra = item.alsoIn?.length ?? 0;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
      <span>{item.source}</span>
      <span aria-hidden="true">·</span>
      <span>{formatRelative(item.publishedAt)}</span>
      {item.topic ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{item.topic}</span>
        </>
      ) : null}
      {extra > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          {/* 중복을 지우지 않고 묶는다. 여러 매체가 다뤘다는 것 자체가 신호다 */}
          <span title={item.alsoIn?.map((o) => o.source).join(", ")}>
            다른 매체 {extra}곳
          </span>
        </>
      ) : null}
    </p>
  );
}

function SourceLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-2 text-xs hover:border-accent hover:text-accent"
    >
      🔗
    </a>
  );
}
