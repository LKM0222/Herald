import { useEffect, useRef, useState } from "react";
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
 * 홈에는 "먼저 볼 것"만 둔다. 나머지 층까지 얹으면 아침에 스크롤이 시작되고,
 * 그 순간 홈이 뉴스 탭의 축소판이 된다.
 * 여러 건은 세로로 쌓지 않고 좌우로 넘긴다 — 한 번에 한 건만 보이면
 * "다음 것도 봐야 하나"를 매번 안 따져도 된다.
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

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Kicker>오늘의 Herald</Kicker>
          <h2 className="max-w-[32ch] font-display text-2xl leading-tight sm:text-[27px]">
            {briefing.headline}
          </h2>
        </div>

        <LeadCarousel leads={leads} total={briefing.news.length} date={date} />

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

/**
 * 좌우로 넘기는 리드 카드.
 *
 * 자바스크립트 캐러셀을 만들지 않고 `scroll-snap` 에 맡긴다 —
 * 터치 관성·접근성·키보드 조작이 브라우저 기본 동작으로 따라온다.
 * 점 표시만 스크롤 위치를 읽어 갱신한다.
 */
function LeadCarousel({
  leads,
  total,
  date,
}: {
  leads: NewsItem[];
  total: number;
  date?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      // 카드 폭은 트랙 폭과 다르다(좌우 여백·간격). 나눗셈으로 넘겨짚지 않고
      // 스크롤 위치에 가장 가까운 카드를 찾는다.
      // ⚠ 이 비교가 성립하려면 트랙이 offsetParent 여야 한다 — 그래서 relative.
      const cards = [...track.children] as HTMLElement[];
      let nearest = 0;
      let best = Infinity;
      cards.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft - track.scrollLeft);
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      setActive(nearest);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => track.removeEventListener("scroll", onScroll);
  }, [leads.length]);

  function goTo(index: number) {
    const track = trackRef.current;
    const card = track?.children[index] as HTMLElement | undefined;
    if (!track || !card) return;
    // 카드 위치를 그대로 목적지로 쓴다 — 폭을 가정하면 snap 이 끌어당기는
    // 자리와 어긋나 제자리로 튕긴다.
    // scrollIntoView 를 쓰지 않는 이유: 세로 스크롤까지 건드린다.
    track.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
  }

  if (leads.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-dim">
        먼저 볼 것으로 분류된 기사가 없어요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div
        ref={trackRef}
        className="relative -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {leads.map((item, index) => (
          <LeadCard
            key={item.id}
            item={item}
            index={index + 1}
            total={leads.length}
          />
        ))}
      </div>

      {leads.length > 1 ? (
        <div className="flex justify-center gap-2">
          {leads.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${index + 1}번째 기사`}
              aria-current={index === active}
              className={`h-1.5 rounded-full transition-all ${
                index === active ? "w-6 bg-accent" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
      ) : null}

      <a
        href={hrefFor("news", date)}
        className="self-start text-[13px] text-accent hover:underline"
      >
        자세한 건 뉴스 탭에서 · 전체 {total}건 →
      </a>
    </div>
  );
}

/**
 * 리드 카드 한 장.
 *
 * "왜 중요한가"를 따로 박스에 가두지 않고 원제·다른 매체와 묶어 한 문단으로
 * 읽힌다 — 홈에서 한 건만 보여주는 이상, 조각내면 오히려 눈이 흩어진다.
 */
function LeadCard({
  item,
  index,
  total,
}: {
  item: NewsItem;
  index: number;
  total: number;
}) {
  return (
    <article className="flex w-full shrink-0 snap-start flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 sm:p-7">
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

      <h3 className="max-w-[24ch] font-display text-2xl leading-[1.18] sm:text-[31px]">
        {item.summary ?? item.title}
      </h3>

      <p className="max-w-[56ch] text-[15px] leading-relaxed text-mid text-pretty">
        {describeItem(item)}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href={item.url} external variant="primary">
          <ExternalLink size={16} strokeWidth={1.5} />
          <span className="whitespace-nowrap">원문 열어보기</span>
        </LinkButton>
        <PendingButton title="담아두기">
          <Bookmark size={16} strokeWidth={1.5} />
          <span className="whitespace-nowrap">담아두기</span>
        </PendingButton>
        <PendingButton title="Claude 로 조사">
          <Search size={16} strokeWidth={1.5} />
          <span className="whitespace-nowrap">Claude 로 조사</span>
        </PendingButton>
      </div>
    </article>
  );
}

/** 관련성 · 중복 보도 · 원제를 한 문단으로 잇는다. 없는 조각은 빠진다. */
function describeItem(item: NewsItem): string {
  const parts: string[] = [];
  if (item.relevance) parts.push(item.relevance);

  const extra = item.alsoIn?.length ?? 0;
  if (extra > 0) parts.push(`같은 사건을 다른 매체 ${extra}곳도 다뤘어요`);

  if (item.summary) parts.push(`원제는 ${item.title} 예요`);

  return parts.length > 0 ? `${parts.join(". ")}.` : item.title;
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
                {item.allDay ? "종일" : item.time}
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
