import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * 좌우로 넘기는 트랙과 점 표시.
 *
 * 자바스크립트 캐러셀을 만들지 않고 `scroll-snap` 에 맡긴다 —
 * 터치 관성·접근성·키보드 조작이 브라우저 기본 동작으로 따라온다.
 * 마우스 드래그만 브라우저가 안 해주는 부분이라 useDragScroll 로 보탠다.
 *
 * 홈의 리드 카드와 뉴스 탭 1층이 같은 동작을 쓴다. 카드 생김새는 서로 다르지만
 * (홈은 한 문단으로 잇고, 뉴스는 원제·요약을 따로 세운다) 넘기는 방식까지
 * 두 벌로 두면 한쪽만 고쳐지는 날이 온다 — 그래서 **동작만** 여기 모았다.
 */

/** 드래그로 볼 최소 이동량(px). 이보다 덜 움직였으면 클릭이다. */
const DRAG_SLOP = 6;

/**
 * 스크롤 위치에 가장 가까운 카드.
 *
 * 카드 폭은 트랙 폭과 다르다(좌우 여백·간격). 나눗셈으로 넘겨짚지 않는다.
 * ⚠ offsetLeft 는 "가장 가까운 위치 지정 조상" 기준이라, 이 비교가 성립하려면
 *   트랙이 offsetParent 여야 한다 — 그래서 트랙에 relative 가 붙어 있다.
 */
function nearestIndex(track: HTMLElement): number {
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
  return nearest;
}

/** 카드 위치를 그대로 목적지로 쓴다 — 폭을 가정하면 snap 이 끄는 자리와 어긋난다. */
function scrollToCard(track: HTMLElement, index: number) {
  const card = track.children[index] as HTMLElement | undefined;
  // scrollIntoView 를 쓰지 않는 이유: 세로 스크롤까지 건드린다.
  if (card) track.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
}

/**
 * 마우스로 붙잡고 끌어서 넘기기.
 *
 * `overflow-x: auto` 는 터치·휠·트랙패드로만 움직인다. 마우스로 끄는 동작은
 * 어느 브라우저에도 없어서 직접 만들어야 한다.
 *
 * 터치는 일부러 건드리지 않는다 — 가로채는 순간 관성 스크롤을 잃는다.
 * 그래서 pointerType 이 mouse 일 때만 개입한다.
 */
function useDragScroll(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const track = ref.current;
    if (!track) return;

    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = 0;
    let suppressClick = false;
    let restoreTimer = 0;

    /**
     * ⚠ 복구 예약은 한 번에 하나만 살아 있어야 한다.
     *
     * 남겨두면 다음 드래그 도중에 터진다. 그 순간 snap 이 되살아나
     * scrollLeft 를 쓸 때마다 스냅 지점으로 되끌려 드래그가 죽는다.
     * 그리고 죽은 채로는 정렬 스크롤도 안 나니 scrollend 가 또 안 와서
     * 예약이 다시 남는다 — 한 번 빠지면 못 나오는 고리다.
     */
    const cancelRestore = () => {
      window.clearTimeout(restoreTimer);
      restoreTimer = 0;
      track.removeEventListener("scrollend", finishRestore);
    };

    // 화살표 함수여야 위의 `if (!track) return` 이 좁혀둔 타입이 살아남는다.
    const finishRestore = () => {
      cancelRestore();
      track.style.scrollSnapType = "";
    };

    /**
     * 정렬 스크롤이 끝나면 snap 을 되돌린다.
     *
     * 도는 도중에 되돌리면 mandatory 스냅이 즉시 잡아채 이동이 툭 끊긴다.
     * 이미 제자리라 스크롤이 아예 안 일어나는 경우(마지막 카드 너머로 민 뒤가
     * 그렇다)엔 scrollend 가 오지 않으므로 타이머를 함께 건다.
     */
    const scheduleRestore = () => {
      cancelRestore();
      track.addEventListener("scrollend", finishRestore);
      restoreTimer = window.setTimeout(finishRestore, 500);
    };

    /** 끌고 놓은 손끝이 버튼 위였다고 그 버튼이 눌리면 안 된다. */
    const swallowClick = (event: MouseEvent) => {
      // detail 0 은 키보드로 누른 click 이다 — 드래그의 잔상이 아니니 통과시킨다.
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      cancelRestore();
      dragging = true;
      moved = 0;
      suppressClick = false;
      startX = event.clientX;
      startScroll = track.scrollLeft;
      // snap 을 켜 둔 채 scrollLeft 를 만지면 브라우저가 매 프레임 스냅 지점으로
      // 되끌어당겨 드래그가 통째로 씹힌다.
      track.style.scrollSnapType = "none";
      track.style.cursor = "grabbing";
      // 텍스트가 잡히거나 링크가 통째로 끌려가는(네이티브 drag) 걸 막는다.
      event.preventDefault();
    };

    // 창 전체에서 듣는다. 트랙 밖으로 손이 나가도 드래그가 이어져야 하고,
    // setPointerCapture 를 쓰면 뒤따르는 click 까지 트랙으로 재조준돼
    // 카드 안 링크가 눌리지 않는다.
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      // 창 밖에서 손을 떼면 pointerup 이 오지 않는다. 그대로 두면 버튼을 뗀
      // 뒤에도 카드가 마우스를 따라다닌다.
      if (event.buttons === 0) {
        onPointerUp();
        return;
      }
      const delta = event.clientX - startX;
      moved = Math.max(moved, Math.abs(delta));
      track.scrollLeft = startScroll - delta;
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      track.style.cursor = "";

      // 리스너를 달았다 떼는 대신 깃발만 세운다 — 뗄 시점을 타이머로 재면
      // 그 타이머가 또 남는다.
      suppressClick = moved > DRAG_SLOP;

      // 손을 뗀 자리는 카드 경계가 아니다. 가까운 카드로 정렬한 뒤 snap 을 되돌린다.
      scrollToCard(track, nearestIndex(track));
      scheduleRestore();
    };

    track.addEventListener("click", swallowClick, { capture: true });
    track.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      track.removeEventListener("click", swallowClick, true);
      cancelRestore();
      track.style.scrollSnapType = "";
      track.style.cursor = "";
    };
  }, [ref]);
}

export function SnapCarousel({
  count,
  label,
  fill = false,
  children,
}: {
  /** 카드 수. 점 개수이자 "넘길 게 있는지" 판단 근거다 */
  count: number;
  /** 점 버튼을 읽어줄 이름 */
  label: (index: number) => string;
  /**
   * 남은 높이를 트랙이 다 먹고 카드도 거기 맞춰 늘어난다.
   *
   * 뉴스 탭에서만 켠다 — 거기선 캐러셀이 화면 한 칸을 통째로 채워야 해서
   * (도면 5A), 카드가 제 내용 높이로 서면 아래가 휑하게 빈다.
   * 홈은 카드가 다른 구획들과 세로로 이어지는 자리라 내용 높이가 맞다.
   */
  fill?: boolean;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => setActive(nearestIndex(track));
    track.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => track.removeEventListener("scroll", onScroll);
  }, [count]);

  useDragScroll(trackRef);

  return (
    <>
      <div
        ref={trackRef}
        className={`relative -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          // 넘길 게 없으면 잡히는 척하지 않는다
          count > 1 ? "cursor-grab" : ""
        } ${
          // min-h-0 이 없으면 flex 자식은 제 내용 높이 밑으로 못 줄어들어
          // flex-1 을 줘도 부모를 넘겨 버린다.
          fill ? "min-h-0 flex-1 items-stretch overflow-y-hidden" : ""
        }`}
      >
        {children}
      </div>

      {count > 1 ? (
        <div className="flex shrink-0 justify-center gap-2">
          {Array.from({ length: count }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                const track = trackRef.current;
                if (track) scrollToCard(track, index);
              }}
              aria-label={label(index)}
              aria-current={index === active}
              className={`h-1.5 rounded-full transition-all ${
                index === active ? "w-6 bg-accent" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
