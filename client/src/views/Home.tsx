import { formatRelative } from "@shared/date";
import type { Briefing, NewsItem } from "@shared/types";
import {
  Bookmark,
  ExternalLink,
  Folder,
  Globe,
  Search,
  Sunset,
  Zap,
} from "lucide-react";
import { Kicker, LinkButton, PendingButton, Tag } from "../components/ui";
import { hrefFor } from "../lib/views";

/**
 * 하루를 여는 화면.
 *
 * 카드 넷을 나란히 놓지 않는다 — 그러면 넷이 다 같은 무게로 읽혀서
 * 아침에 어디부터 볼지가 안 정해진다. 1순위 기사 하나를 크게 세우고
 * 나머지는 옆 스트립으로 밀어 무게를 갈랐다.
 */
export function Home({
  briefing,
  date,
}: {
  briefing: Briefing;
  /** 오늘이면 생략한다 — 링크에 불필요한 ?d= 를 붙이지 않기 위해 */
  date?: string;
}) {
  const leads = briefing.news.filter((item) => item.priority === 1);
  const [first, ...restLeads] = leads;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Kicker>오늘의 Herald</Kicker>
          <h2 className="max-w-[32ch] font-display text-2xl leading-tight sm:text-[27px]">
            {briefing.headline}
          </h2>
        </div>

        {first ? (
          <LeadArticle item={first} index={1} total={leads.length} />
        ) : (
          <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-dim">
            먼저 볼 것으로 분류된 기사가 없습니다.
          </p>
        )}

        {restLeads.map((item, index) => (
          <SecondaryRow
            key={item.id}
            item={item}
            index={index + 2}
            date={date}
          />
        ))}

        <ContinueSection briefing={briefing} />
      </div>

      {/* 우측 스트립 — 모바일에선 본문 아래로 내려온다 */}
      <aside className="flex shrink-0 flex-col gap-7 border-line lg:w-56 lg:border-l lg:pl-6">
        <Stats briefing={briefing} />
        <Schedule briefing={briefing} />
        <Launchpad briefing={briefing} />
      </aside>
    </div>
  );
}

/** 1순위 기사. 제목을 크게 세우고 "왜 중요한가"를 강조 박스로 편다. */
function LeadArticle({
  item,
  index,
  total,
}: {
  item: NewsItem;
  index: number;
  total: number;
}) {
  const extra = item.alsoIn?.length ?? 0;

  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <Kicker tone="accent">
          먼저 볼 것 · {String(index).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </Kicker>
        <span className="hidden h-px flex-1 bg-line sm:block" />
        <span className="text-[11px] text-dim">
          {item.source} · {formatRelative(item.publishedAt)}
          {item.topic ? ` · ${item.topic}` : ""}
        </span>
      </div>

      <h3 className="max-w-[24ch] font-display text-2xl leading-[1.18] sm:text-[33px]">
        {item.summary ?? item.title}
      </h3>

      {item.relevance ? (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent-ink">
          {item.relevance}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={item.url} external variant="primary">
          <ExternalLink size={16} strokeWidth={1.5} />
          원문 열어보기
        </LinkButton>
        <PendingButton title="담아두기">
          <Bookmark size={16} strokeWidth={1.5} />
          담아두기
        </PendingButton>
        <PendingButton title="Claude 로 조사">
          <Search size={16} strokeWidth={1.5} />
          Claude 로 조사
        </PendingButton>
        {extra > 0 ? (
          <span className="text-[11px] text-dim">
            다른 매체 {extra}곳도 다뤘어요
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** 2순위 이후의 1층 기사. 번호를 앞세우고 한 줄로 줄인다. */
function SecondaryRow({
  item,
  index,
  date,
}: {
  item: NewsItem;
  index: number;
  date?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4">
      <span className="font-display text-base text-accent">
        {String(index).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base leading-snug">
          {item.summary ?? item.title}
        </span>
        <span className="text-[11px] text-dim">
          {item.source} · {formatRelative(item.publishedAt)}
          {item.topic ? ` · ${item.topic}` : ""}
        </span>
      </div>
      <a
        href={hrefFor("news", date)}
        className="hidden shrink-0 text-[13px] text-accent hover:underline sm:inline"
      >
        뉴스 탭에서 다 보기 →
      </a>
    </div>
  );
}

function ContinueSection({ briefing }: { briefing: Briefing }) {
  if (briefing.continues.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-display text-[13px] uppercase tracking-[0.1em] text-dim">
        어제 이어서
      </h3>
      {briefing.continues.map((item) => (
        <div
          key={item.project}
          className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-5 py-4"
        >
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-lg">{item.project}</span>
            <span className="text-[11px] text-dim">
              어제는 {item.yesterday}
            </span>
          </div>
          <p className="text-[15px]">{item.next}</p>
          <div className="mt-1">
            <PendingButton title="세션 열고 이어가기">
              <Zap size={16} strokeWidth={1.5} />
              세션 열고 이어가기
            </PendingButton>
          </div>
        </div>
      ))}
    </section>
  );
}

function Stats({ briefing }: { briefing: Briefing }) {
  const rows = [
    { label: "모인 기사", value: briefing.news.length, accent: false },
    {
      label: "먼저 볼 것",
      value: briefing.news.filter((item) => item.priority === 1).length,
      accent: true,
    },
    { label: "오늘 일정", value: briefing.schedule.length, accent: false },
  ];

  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>지금 상황</Kicker>
      <div className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between border-b border-line py-2"
          >
            <span className="text-xs text-mid">{row.label}</span>
            <span
              className={`font-display text-xl ${row.accent ? "text-accent" : ""}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Schedule({ briefing }: { briefing: Briefing }) {
  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>일정</Kicker>
      {briefing.schedule.length === 0 ? (
        <p className="text-[13px] text-dim">오늘은 일정이 없어요</p>
      ) : (
        <div className="flex flex-col gap-2 text-[13px]">
          {briefing.schedule.map((item) => (
            <div key={item.id} className="flex gap-2.5">
              <span className="font-display tabular-nums text-accent">
                {item.time}
              </span>
              <span>{item.title}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const LAUNCH_ICONS = {
  "작업 시작": Zap,
  "하루 마무리": Sunset,
  탐색기: Folder,
  크롬: Globe,
} as const;

function Launchpad({ briefing }: { briefing: Briefing }) {
  return (
    <section className="flex flex-col gap-2.5">
      <Kicker>런치패드</Kicker>
      <span className="self-start">
        <Tag>핸들러를 아직 안 깔았어요</Tag>
      </span>
      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
        {briefing.launchpad.map((item) => {
          const Icon =
            LAUNCH_ICONS[item.label as keyof typeof LAUNCH_ICONS] ?? Zap;
          return (
            <PendingButton
              key={item.id}
              title={item.label}
              className="justify-start"
            >
              <Icon size={16} strokeWidth={1.5} />
              {item.label}
            </PendingButton>
          );
        })}
      </div>
    </section>
  );
}
