import { formatRelative } from "@shared/date";
import type { Briefing, NewsItem, Priority } from "@shared/types";
import { Bookmark, ChevronDown, ExternalLink, Search } from "lucide-react";
import { Kicker, LinkButton, PendingButton, Tag } from "../components/ui";
import { hrefFor } from "../lib/views";

/**
 * 기사는 중요도로 3층을 이룬다.
 *
 * 층마다 담는 그릇을 바꾼다 — 1층은 펼친 구획, 2층은 표, 3층은 접힘.
 * 20건을 같은 카드에 평평하게 늘어놓으면 아무것도 안 읽는다.
 * 주제별로 묶지 않는 이유: 아침에 필요한 건 분류가 아니라 순서다.
 */
const TIERS: { priority: Priority; no: string; label: string }[] = [
  { priority: 1, no: "01", label: "먼저 볼 것" },
  { priority: 2, no: "02", label: "훑어볼 것" },
  { priority: 3, no: "03", label: "참고" },
];

export function News({
  briefing,
  date,
  today,
}: {
  briefing: Briefing;
  date: string;
  today: string;
}) {
  // priority 가 없는 항목(수집만 되고 요약 전)은 맨 아래 층으로 보낸다.
  const byTier = TIERS.map((tier) => ({
    ...tier,
    items: briefing.news.filter(
      (item) => (item.priority ?? 3) === tier.priority,
    ),
  }));
  const filled = byTier.filter((tier) => tier.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <TierBar
        total={briefing.news.length}
        tiers={byTier}
        date={date}
        today={today}
      />

      {briefing.news.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-dim">
          오늘 모인 기사가 없습니다.
        </p>
      ) : (
        filled.map((tier) => (
          <section key={tier.priority} className="flex flex-col gap-3.5">
            {tier.priority === 3 ? null : (
              <h3
                className={`font-display text-sm uppercase tracking-[0.1em] ${
                  tier.priority === 1 ? "text-accent" : "text-dim"
                }`}
              >
                {tier.no} · {tier.label}
              </h3>
            )}

            {tier.priority === 1 ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {tier.items.map((item) => (
                  <LeadCard key={item.id} item={item} />
                ))}
              </div>
            ) : tier.priority === 2 ? (
              <SkimList items={tier.items} />
            ) : (
              <ReferenceFold tier={tier} />
            )}
          </section>
        ))
      )}
    </div>
  );
}

/** 층별 건수를 먼저 보여준다 — 스크롤하기 전에 오늘의 부피를 알 수 있게. */
function TierBar({
  total,
  tiers,
  date,
  today,
}: {
  total: number;
  tiers: { priority: Priority; label: string; items: NewsItem[] }[];
  date: string;
  today: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
      <div className="flex flex-col gap-1">
        <Kicker>오늘 볼 것</Kicker>
        <span className="font-display text-2xl sm:text-[26px]">
          {total}건 · {tiers.filter((t) => t.items.length > 0).length}층
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-4 text-xs text-mid">
        {tiers.map((tier) => (
          <span key={tier.priority}>
            {tier.label}{" "}
            <span
              className={`font-display text-base ${
                tier.priority === 1 ? "text-accent" : ""
              }`}
            >
              {tier.items.length}
            </span>
          </span>
        ))}
        {date !== today ? (
          <a
            href={hrefFor("news", today)}
            className="text-xs text-accent hover:underline"
          >
            오늘로 가기 →
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** 1층 — 요약이 제목 자리를 차지하고, 원제는 확인용으로 밑에 남긴다. */
function LeadCard({ item }: { item: NewsItem }) {
  const extra = item.alsoIn?.length ?? 0;

  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5">
      <h4 className="font-display text-xl leading-tight sm:text-[22px]">
        {item.summary ?? item.title}
      </h4>

      {item.relevance ? (
        <p className="border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-accent-ink">
          {item.relevance}
        </p>
      ) : null}

      {item.summary ? (
        <p className="line-clamp-2 text-xs leading-snug text-dim">
          원제 · {item.title}
        </p>
      ) : null}

      <span className="text-[11px] text-dim">
        {item.source} · {formatRelative(item.publishedAt)}
        {item.topic ? ` · ${item.topic}` : ""}
        {extra > 0 ? ` · 다른 매체 ${extra}곳` : ""}
      </span>

      <div className="mt-1 flex gap-2">
        <LinkButton href={item.url} external variant="primary">
          <ExternalLink size={16} strokeWidth={1.5} />
          원문
        </LinkButton>
        <PendingButton title="담아두기" className="w-11 px-0">
          <Bookmark size={16} strokeWidth={1.5} />
        </PendingButton>
        <PendingButton title="Claude 로 조사" className="w-11 px-0">
          <Search size={16} strokeWidth={1.5} />
        </PendingButton>
      </div>
    </article>
  );
}

/**
 * 2층 — 표.
 * 좁은 화면에서 표를 옆으로 스크롤시키지 않는다. 같은 데이터를 행으로 접는다.
 */
function SkimList({ items }: { items: NewsItem[] }) {
  return (
    <ul className="flex flex-col border-t border-line">
      {items.map((item) => (
        <li key={item.id} className="border-b border-line">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-h-11 flex-col gap-1 py-3 hover:text-accent sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="flex-1 text-sm leading-snug">
              {item.summary ?? item.title}
            </span>
            <span className="flex items-center gap-3 text-xs text-dim">
              <span>{item.source}</span>
              <span>{formatRelative(item.publishedAt)}</span>
              {item.topic ? <Tag tone="accent">{item.topic}</Tag> : null}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** 3층 — 접어둔다. 열기 전엔 건수만 보인다. */
function ReferenceFold({
  tier,
}: {
  tier: { no: string; label: string; items: NewsItem[] };
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-1">
        <h3 className="font-display text-sm uppercase tracking-[0.1em] text-dim">
          {tier.no} · {tier.label}
        </h3>
        <span className="text-xs text-dim">{tier.items.length}건 · 접힘</span>
        <span className="h-px flex-1 bg-line" />
        <span className="flex items-center gap-1 text-[13px] text-accent">
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className="transition-transform group-open:rotate-180"
          />
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <div className="mt-3">
        <SkimList items={tier.items} />
      </div>
    </details>
  );
}
