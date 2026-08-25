import { useEffect, type ReactNode } from "react";
import { formatRelative } from "@shared/date";
import type { Briefing, NewsItem, Priority } from "@shared/types";
import { Bookmark, ChevronDown, ExternalLink, Search } from "lucide-react";
import { SnapCarousel } from "../components/SnapCarousel";
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

/**
 * 세로 스냅을 켜는 표시를 `<html>` 에 달았다 뗀다.
 *
 * 스냅은 **구르는 요소**에 걸어야 하는데 이 앱은 폭에 따라 구르는 놈이
 * 바뀐다 — md 이상은 `<main>`, 그 아래는 문서 자체다(index.css 의
 * app-shell-frame 주석). JSX 로는 `<html>` 에 손이 닿지 않아 여기서 단다.
 *
 * 뉴스 탭에서만 켜는 이유: scroll-snap-align 은 가로·세로를 한꺼번에 정하는
 * 속성이라, 문서에 세로 스냅을 상시로 걸면 홈의 가로 캐러셀 카드(snap-start)가
 * 세로로도 걸려 홈 스크롤이 카드마다 끊긴다.
 */
function useVerticalSnap() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("news-snap");
    return () => root.classList.remove("news-snap");
  }, []);
}

export function News({
  briefing,
  date,
  today,
}: {
  briefing: Briefing;
  date: string;
  today: string;
}) {
  useVerticalSnap();

  // priority 가 없는 항목(수집만 되고 요약 전)은 맨 아래 층으로 보낸다.
  const byTier = TIERS.map((tier) => ({
    ...tier,
    items: briefing.news.filter(
      (item) => (item.priority ?? 3) === tier.priority,
    ),
  }));
  const filled = byTier.filter((tier) => tier.items.length > 0);

  const tierBar = (
    <TierBar
      total={briefing.news.length}
      tiers={byTier}
      date={date}
      today={today}
    />
  );

  return (
    /*
     * md:h-full — PC 에서 칸 높이(.news-panel 의 min-height:100%)가 풀리려면
     * 이 뿌리가 확정된 높이를 들고 있어야 한다. 퍼센트는 "높이가 정해진 조상"
     * 을 찾아 올라가는데, 여기서 auto 로 끊기면 칸이 내용 높이로 주저앉아
     * 스냅이 통째로 무너진다.
     */
    <div className="flex w-full min-w-0 flex-col md:h-full">
      {briefing.news.length === 0 ? (
        <SnapPanel first>
          {tierBar}
          <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-dim">
            오늘 모인 기사가 없습니다.
          </p>
        </SnapPanel>
      ) : (
        filled.map((tier, order) => (
          <SnapPanel key={tier.priority} first={order === 0}>
            {/* 오늘의 부피는 첫 칸 위에만 한 번 선다 — 칸마다 이고 있으면
                정작 기사보다 머리글이 먼저 읽힌다 */}
            {order === 0 ? tierBar : null}

            {tier.priority === 3 ? null : (
              <h3
                className={`shrink-0 font-display text-sm uppercase tracking-[0.1em] ${
                  tier.priority === 1 ? "text-accent" : "text-dim"
                }`}
              >
                {tier.no} · {tier.label}
              </h3>
            )}

            {tier.priority === 1 ? (
              /*
                1층은 좌우로 넘긴다(도면 5A). 두 장을 나란히 세우면 서로
                크기를 깎아먹어 "먼저 볼 것" 이 먼저로 안 읽힌다.
                넘기는 동작은 홈과 같은 SnapCarousel 을 쓴다.

                fill — 이 칸은 화면을 통째로 차지한다. 카드가 제 내용 높이로
                서면 아래가 휑하게 남아 "가득 찬 한 화면" 이 안 된다.
              */
              <SnapCarousel
                fill
                count={tier.items.length}
                label={(index) => `먼저 볼 것 ${index + 1}번째`}
              >
                {tier.items.map((item, index) => (
                  <LeadCard
                    key={item.id}
                    item={item}
                    index={index + 1}
                    total={tier.items.length}
                  />
                ))}
              </SnapCarousel>
            ) : tier.priority === 2 ? (
              <SkimList items={tier.items} />
            ) : (
              <ReferenceFold tier={tier} />
            )}
          </SnapPanel>
        ))
      )}
    </div>
  );
}

/**
 * 스냅 한 칸 = 층 하나.
 *
 * 원래 세 층이 죽 이어져 있어서, 스크롤을 멈춘 자리가 어느 층인지 매번 다시
 * 찾아야 했다. 이제 한 층이 화면을 통째로 차지하고 다음 층은 한 번 굴리면
 * 딱 끊어 들어온다 — 어디까지 봤는지가 스크롤 위치가 아니라 화면 자체로 남는다.
 *
 * 실제로 걸리는 규칙(높이 · 스냅 · 떠오르는 애니메이션)은 index.css 의
 * `.news-panel` 에 있다. 위아래 여백만 여기서 준다 — 좌우는 AppShell 의
 * `<main>` 이 이미 대고 있어서 여기서 또 대면 두 겹이 된다.
 *
 * ⚠ shrink-0 — 이 칸들은 세로 flex 자식이다. 없으면 형제 칸에 눌려
 *   min-height 아래로 찌그러지고, 그 순간 "한 칸 = 한 화면" 이 깨진다.
 */
function SnapPanel({
  first = false,
  children,
}: {
  /** 첫 칸은 위 여백을 조금 줄인다 — 머리글이 화면 꼭대기에 붙어 보이게 */
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`news-panel flex shrink-0 flex-col ${
        first ? "gap-5 pb-6 pt-5" : "justify-center gap-3.5 py-6"
      }`}
    >
      {children}
    </section>
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
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
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

/**
 * 1층 카드.
 *
 * 요약이 제목 자리를 차지하고 원제는 바로 밑에 붙는다 — 도면 5A 에서 원제가
 * "왜 중요한가" 블록 아래에서 제목 밑으로 올라왔다. 원제는 **같은 기사가
 * 맞는지 확인하는 용도**라 제목에서 멀어지면 대조할 수가 없다.
 *
 * 출처·시각은 맨 위 줄로 올라간다. 카드를 넘기며 보는 화면이라
 * 어디서 언제 온 기사인지가 본문보다 먼저 눈에 걸려야 한다.
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
  const extra = item.alsoIn?.length ?? 0;

  return (
    <article className="flex w-full shrink-0 snap-start flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <Kicker tone="accent">
          먼저 볼 것 · {String(index).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </Kicker>
        <span className="hidden h-px flex-1 bg-line sm:block" />
        <span className="text-[11px] text-dim break-keep">
          {item.source} · {formatRelative(item.publishedAt)}
          {item.topic ? ` · ${item.topic}` : ""}
          {extra > 0 ? ` · 다른 매체 ${extra}곳` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <h4 className="max-w-[24ch] font-display text-2xl leading-[1.18] break-keep sm:text-[31px]">
          {item.summary ?? item.title}
        </h4>
        {/* 요약이 없으면 위 제목이 이미 원제다. 같은 문장을 두 번 쓰지 않는다 */}
        {item.summary ? (
          <p className="text-xs leading-[1.4] text-dim">원제 · {item.title}</p>
        ) : null}
      </div>

      {/*
        도면은 이 블록에 96px(세 줄분)을 미리 비워 카드 높이를 맞춘다.
        ⚠ 다만 relevance 가 없을 때까지 블록을 그리면 빈 색 상자만 남는다 —
          요약 단계를 안 거친 기사가 실제로 그렇다. 그래서 있을 때만 그린다.
      */}
      {item.relevance ? (
        <p className="max-w-[52ch] border-l-2 border-accent bg-accent-soft px-3.5 py-3 text-sm leading-relaxed text-accent-ink text-pretty sm:min-h-24">
          {item.relevance}
        </p>
      ) : null}

      {/* mt-auto — 카드 높이가 제각각이어도 버튼 줄은 바닥에 나란히 선다 */}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
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
 * 2층 — 한 줄짜리 행.
 *
 * 도면 5A 에서 표(table)가 사라지고 행 끝에 **바로가기 버튼**이 붙었다.
 * 줄 전체를 링크로 감싸지 않는 이유가 여기 있다: 감싸면 제목을 긁어 복사할
 * 수도, 길게 눌러 메뉴를 열 수도 없다. 여는 건 버튼 하나가 맡는다.
 *
 * 요약이 없는 기사가 대부분인 층이다(요약은 1층에만 붙는다) —
 * 그래서 여기 제목은 summary 가 아니라 원제인 경우가 정상이다.
 */
function SkimList({ items }: { items: NewsItem[] }) {
  return (
    <ul className="flex flex-col border-t border-line">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex min-h-11 flex-col gap-1 border-b border-line py-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="min-w-0 flex-1 text-sm leading-snug break-keep">
            {item.summary ?? item.title}
          </span>
          <span className="flex items-center gap-3 text-xs text-dim">
            <span className="shrink-0">{item.source}</span>
            <span className="shrink-0">{formatRelative(item.publishedAt)}</span>
            {item.topic ? <Tag tone="accent">{item.topic}</Tag> : null}
            {/*
              도면의 28px 을 40px 로 키웠다 — CLAUDE.md 가 조밀한 컨트롤도
              40px 밑으로 내리지 말라고 못박아 뒀고, 이건 폰에서 누르는 것이다.
            */}
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              title={`${item.summary ?? item.title} 원문 열기`}
              className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-line text-mid hover:bg-fg/[0.07] hover:text-accent active:bg-fg/[0.14]"
            >
              <ExternalLink size={16} strokeWidth={1.5} aria-hidden="true" />
            </a>
          </span>
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
