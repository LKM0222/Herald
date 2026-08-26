import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
 * 스냅이 걸릴 곳은 `<main>` 하나지만, 표시는 `<html>` 에 단다 — CSS 가
 * `.news-snap main[data-scrollarea]` 로 잡기 때문이고, JSX 로는 `<html>` 에
 * 손이 닿지 않아 여기서 달았다 뗀다.
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

/**
 * 스냅이 걸린 스크롤 컨테이너 — 언제나 <main data-scrollarea> 다.
 *
 * 예전엔 폭에 따라 문서일 수도 있어서 "정말 넘치는 쪽" 을 골라야 했다.
 * 셸이 모든 폭에서 뷰포트 높이에 고정된 뒤로는 구르는 놈이 하나뿐이다.
 */
function scrollerFor(root: HTMLElement | null): HTMLElement | null {
  return root?.closest<HTMLElement>("[data-scrollarea]") ?? null;
}

/**
 * 지금 몇 번째 층에 서 있는지. 오른쪽 도트가 이 값을 쓴다.
 *
 * 칸 폭을 나눗셈으로 넘겨짚지 않고 **화면 꼭대기에 가장 가까운 칸**을 고른다
 * (SnapCarousel 의 nearestIndex 와 같은 문법이다). 칸 높이가 내용에 따라
 * 늘어날 수 있어서 — min-height 라 그렇다 — 나눗셈은 어긋난다.
 *
 * ⚠ 칸에 tierIn 의 translateY 가 걸려 있어 rect.top 이 최대 28px 밀린다.
 *   스냅이 늘 칸 꼭대기에 세워 주므로 멈춘 자리에서는 정확하고, 구르는
 *   도중에만 잠깐 흔들린다 — 도트는 멈춘 자리만 맞으면 된다.
 */
function useActiveTier(
  root: RefObject<HTMLDivElement | null>,
  count: number,
): number {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const scroller = scrollerFor(root.current);
    if (!scroller || count === 0) return;

    const read = () => {
      const panels = [
        ...(root.current?.querySelectorAll<HTMLElement>(".news-panel") ?? []),
      ];
      const portTop = scroller.getBoundingClientRect().top;
      let nearest = 0;
      let best = Infinity;
      panels.forEach((panel, index) => {
        const distance = Math.abs(panel.getBoundingClientRect().top - portTop);
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      setActive(nearest);
    };

    scroller.addEventListener("scroll", read, { passive: true });
    read();
    return () => scroller.removeEventListener("scroll", read);
  }, [root, count]);

  return active;
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

  const rootRef = useRef<HTMLDivElement>(null);
  const active = useActiveTier(rootRef, filled.length);

  // 지난 날짜를 보고 있을 때만 나온다. 도면엔 없지만 이게 없으면 오늘로 돌아올
  // 길이 화면에서 사라진다 — 예전엔 층 머리띠가 들고 있던 링크다.
  const backToToday =
    date !== today ? (
      <a
        href={hrefFor("news", today)}
        className="shrink-0 self-start text-xs text-accent hover:underline"
      >
        오늘로 가기 →
      </a>
    ) : null;

  return (
    /*
     * h-full — 칸 높이(.news-panel 의 min-height:100%)가 풀리려면 이 뿌리가
     * 확정된 높이를 들고 있어야 한다. 퍼센트는 "높이가 정해진 조상" 을 찾아
     * 올라가는데, 여기서 auto 로 끊기면 칸이 내용 높이로 주저앉아 스냅이
     * 통째로 무너진다. 예전엔 md 부터만이었다 — 그 아래선 문서가 굴렀다.
     */
    <div ref={rootRef} className="flex h-full w-full min-w-0 flex-col">
      {briefing.news.length === 0 ? (
        <SnapPanel first>
          <Kicker>오늘 볼 것</Kicker>
          <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-dim">
            오늘 모인 기사가 없습니다.
          </p>
          {backToToday}
        </SnapPanel>
      ) : (
        filled.map((tier, order) => (
          <SnapPanel key={tier.priority} first={order === 0}>
            {/*
              층 이름이 건수를 같이 들고 있다(도면 5A). 예전엔 첫 칸 위에
              "6건 · 3층" 머리띠가 따로 섰는데, 오른쪽 도트가 이미 몇 층 중
              몇 번째인지 말해줘서 같은 말을 두 번 하는 자리가 됐다.
              머리띠를 걷어낸 자리만큼 기사가 위로 올라온다.
            */}
            {tier.priority === 3 ? null : (
              <div className="flex shrink-0 items-center gap-2.5">
                <h3
                  className={`font-display text-sm uppercase tracking-[0.1em] ${
                    tier.priority === 1 ? "text-accent" : "text-dim"
                  }`}
                >
                  {tier.no} · {tier.label}{" "}
                  <span className="text-dim">{tier.items.length}건</span>
                </h3>
                <span className="h-px flex-1 bg-line" />
                {order === 0 ? backToToday : null}
              </div>
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
              <>
                <ReferenceFold tier={tier} />
                {order === 0 ? backToToday : null}
              </>
            )}
          </SnapPanel>
        ))
      )}

      <TierDots tiers={filled} active={active} root={rootRef} />
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
 * `.news-panel` 에 있다.
 *
 * ⚠ **여백은 네 방향 다 여기서 준다** (도면 5A · 6B: 20px 24px 24px / 20px 16px 24px).
 *   `<main>` 에 두면 안 된다 — 위아래 여백이 스냅 지점을 밀어서 칸이 화면에
 *   딱 안 맞는다. 그래서 `<main>` 을 px-0 으로 비웠는데, 그때 좌우까지 같이
 *   비어 버려 층 제목이 화면 왼쪽 끝에 붙고 카드가 4px 밖으로 나갔다.
 *   한쪽만 옮기면 안 되는 짝이다.
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
    /*
      전부 상단 정렬이다(도면 5A: justify-content flex-start). 가운데로 모으면
      층마다 글이 시작하는 높이가 달라서, 넘길 때마다 눈이 첫 줄을 다시 찾는다.
      위를 맞춰 두면 층이 바뀌어도 시선이 한자리에 선다.
    */
    <section
      className={`news-panel flex shrink-0 flex-col px-4 sm:px-6 ${
        first ? "gap-5 pb-6 pt-5" : "gap-3.5 py-6"
      }`}
    >
      {children}
    </section>
  );
}

/**
 * 오른쪽 가장자리의 스냅 도트 (도면 5A).
 *
 * 스크롤바를 지운 자리를 대신한다. 스크롤바는 "얼마나 남았나" 를 픽셀로
 * 말하는데, 이 화면에서 알고 싶은 건 거리가 아니라 **몇 층 중 몇 번째냐** 다.
 * 도트가 그 셋을 그대로 그린다. 홈의 가로 캐러셀 도트와 같은 문법을 세로로 세운 것.
 *
 * ⚠ absolute 인데 <main> 안에 있어도 같이 흘러가지 않는다. 기준(containing
 *   block)이 .app-shell-frame 이라 <main> 의 overflow 바깥이기 때문이다.
 *   예전엔 fixed + right:max(12px, calc(50% - 564px)) 로 창 폭을 손계산했는데,
 *   틀이 relative 를 갖게 되면서 도면대로 right:12px 하나면 끝난다.
 */
function TierDots({
  tiers,
  active,
  root,
}: {
  tiers: { no: string; label: string }[];
  active: number;
  root: RefObject<HTMLDivElement | null>;
}) {
  // 층이 하나뿐이면 넘길 곳이 없다. 있는 척하지 않는다.
  if (tiers.length < 2) return null;

  return (
    <div
      className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2"
      role="tablist"
      aria-label="뉴스 층"
    >
      {tiers.map((tier, index) => (
        <button
          key={tier.no}
          type="button"
          role="tab"
          aria-selected={index === active}
          aria-label={`${tier.no} · ${tier.label}`}
          onClick={() => {
            const panels =
              root.current?.querySelectorAll<HTMLElement>(".news-panel");
            // scrollIntoView 를 쓴다 — 여기선 세로로 옮기는 게 목적이라
            // SnapCarousel 이 이걸 피한 이유(세로까지 건드림)가 반대로 작동한다.
            panels?.[index]?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
          className={`news-dot w-1.5 rounded-full transition-all ${
            index === active ? "h-[22px] bg-accent" : "h-1.5 bg-line"
          }`}
        />
      ))}
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
    /*
       측정값(max-w)이 홈 카드와 다르다. 홈 카드는 644px 라 24ch(333px)가
       절반을 쓰는데, 이 카드는 칸을 통째로 채워 928px 라 같은 24ch 가 36%
       밖에 안 돼 오른쪽이 휑하게 빈다. 도면이 720px 틀로 그려져 있어 넓은
       화면 몫이 정해져 있지 않았다 — 도면의 비율(약 60%)을 유지하도록 넓혔다.
       읽기 좋은 길이는 지킨다: 제목 38ch, 본문 68ch 위로는 안 늘린다.
    */
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
        <h4 className="max-w-[38ch] font-display text-2xl leading-[1.18] break-keep sm:text-[31px]">
          {item.headline ?? item.title}
        </h4>
        {/* 표제가 없으면 위가 이미 원제다. 같은 문장을 두 번 쓰지 않는다 */}
        {item.headline ? (
          <p className="text-xs leading-[1.4] text-dim">원제 · {item.title}</p>
        ) : null}
        {/* 설명은 표제 아래 제자리에. 예전엔 요약이 제목 노릇을 해서
            읽을 문장이 표제 자리에 올라가 있었다 */}
        {item.summary ? (
          <p className="max-w-[68ch] pt-1 text-[15px] leading-relaxed text-mid text-pretty">
            {item.summary}
          </p>
        ) : null}
      </div>

      {/*
        도면은 이 블록에 96px(세 줄분)을 미리 비워 카드 높이를 맞춘다.
        ⚠ 다만 relevance 가 없을 때까지 블록을 그리면 빈 색 상자만 남는다 —
          요약 단계를 안 거친 기사가 실제로 그렇다. 그래서 있을 때만 그린다.
      */}
      {item.relevance ? (
        <p className="max-w-[68ch] border-l-2 border-accent bg-accent-soft px-3.5 py-3 text-sm leading-relaxed text-accent-ink text-pretty sm:min-h-24">
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

/**
 * 3층 — 접을 수 있지만 열어 둔다.
 *
 * 예전엔 접힌 채로 시작했다. 그땐 이 층이 앞 층들 밑에 딸린 꼬리였고, 접어두면
 * 스크롤이 그만큼 짧아지는 이득이 있었다. 지금은 한 층이 화면을 통째로 쓴다 —
 * 접어두면 "펼치기" 한 줄만 놓인 빈 화면 한 장을 넘겨야 한다(도면 5A 도
 * 펼친 상태로 그려져 있다). 접는 것 자체는 남긴다. 건수가 많은 날이 있다.
 */
function ReferenceFold({
  tier,
}: {
  tier: { no: string; label: string; items: NewsItem[] };
}) {
  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-1">
        <h3 className="font-display text-sm uppercase tracking-[0.1em] text-dim">
          {tier.no} · {tier.label}{" "}
          <span className="text-dim">{tier.items.length}건</span>
        </h3>
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
