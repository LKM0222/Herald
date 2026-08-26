import { useState } from "react";
import type { NewsItem } from "@shared/types";
import logoDark from "../assets/logo-dark.jpg";
import logoLight from "../assets/logo-light.jpg";

/**
 * 1층 카드의 이미지 자리 (도면 6B · 7A).
 *
 * 지금은 **거의 항상 로고가 뜬다.** RSS 항목에 이미지 주소 필드가 아직 없어서다.
 * 그래도 "주소가 있으면 그걸, 없거나 실패하면 로고" 로 짜 둔다 — 나중에 수집이
 * 이미지를 물어오기 시작하면 이 파일을 안 건드리고 필드만 채우면 된다.
 */

/**
 * 항목에서 이미지 주소를 조심스럽게 꺼낸다.
 *
 * ⚠ `NewsItem` 에는 아직 이 필드가 없다. shared/types.ts 는 서버 쪽이 들고 있어서
 *   화면이 마음대로 넓히지 않는다 — 대신 있으면 쓰고 없으면 마는 형태로 읽는다.
 *   서버가 필드를 붙이는 날, 이름만 여기서 맞춰 주면 끝난다.
 */
function imageUrlOf(item: NewsItem): string | undefined {
  const raw = (item as { image?: unknown }).image;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
}

/**
 * 대체 로고 — 밝기별로 두 벌을 다 렌더하고 CSS 가 한쪽을 감춘다.
 *
 * Logo.tsx 와 같은 문법이다(index.css 의 `[data-logo]`). JS 로 고르지 않는 이유도
 * 같다: 테마는 첫 페인트 전에 인라인 스크립트가 정하는데 여기만 React 를
 * 기다리면 잘못된 쪽이 한 번 스친다. 덤으로 테마를 바꾸는 순간 즉시 갈린다 —
 * 다시 그릴 것이 없기 때문이다.
 */
function FallbackLogo({ className }: { className: string }) {
  return (
    <>
      <img data-logo="light" src={logoLight} alt="" aria-hidden="true" className={className} />
      <img data-logo="dark" src={logoDark} alt="" aria-hidden="true" className={className} />
    </>
  );
}

export function NewsImage({
  item,
  className = "",
}: {
  item: NewsItem;
  /** 슬롯의 크기를 부르는 쪽이 정한다 — 모바일은 고정 높이, 데스크탑은 한 단 */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = imageUrlOf(item);
  const showImage = url !== undefined && !failed;

  /*
    ⚠ **자르지도 늘이지도 않는다** — 세로를 슬롯에 맞추고 가로는 비율대로 따라간다.
      로고는 512×512 정사각인데 모바일 슬롯은 가로로 긴 상자다. cover 면 로고의
      위아래가 잘리고 fill 이면 옆으로 늘어난다. 그래서 contain + h-full + w-auto 다.
      max-w-full 은 반대쪽 보험이다 — 나중에 들어올 진짜 기사 이미지가 16:9 로
      넓으면 세로를 채우다 슬롯 밖으로 삐져나가는데, 그때는 가로에 맞춰 눕는다.

    남는 자리는 가운데 정렬로 두고 바탕은 `bg-bg` 로 깐다.

    ⚠ 바탕색을 accent-soft 에서 bg 로 바꾼 이유가 있다. 대체 로고는 **투명 PNG 가
      아니라 배경이 구워진 JPEG** 다 — 실측으로 다크판 바탕이 rgb(23,24,28),
      라이트판이 rgb(253,253,253) 이다. 정사각 로고를 가로로 긴 슬롯에 넣으면
      위아래(데스크탑) · 좌우(모바일)로 띠가 남는데, 그 띠가 accent-soft 면
      불그스름한 자리에 시커먼 정사각이 얹힌 꼴이 된다. bg 는 다크에서
      rgb(25,24,23) 이라 로고 바탕과 거의 같아서 이음매가 사라진다.
      (그래도 색은 직접 적지 않는다 — 역할 이름으로만 부른다. CLAUDE.md 화면 규칙)
  */
  const fit = "h-full w-auto max-w-full object-contain";

  /*
    ⚠ `display` 와 `flex-shrink` 는 여기서 정하지 않는다 — 부르는 쪽이 준다.
      여기에 `flex` 나 `shrink-0` 을 박아 두면 부르는 쪽의 `hidden` · `flex-1` 과
      **같은 층·같은 특이도**로 부딪히는데, Tailwind v4 는 소스에 쓴 순서가 아니라
      제 규칙으로 정렬해서 어느 쪽이 이길지 보장이 안 된다
      (index.css 의 h-screen + h-dvh 주석과 같은 함정).
      브레이크포인트가 붙은 쪽(lg:)은 미디어쿼리라 순서가 확정되므로 안전하다.
  */
  return (
    <div
      className={`items-center justify-center overflow-hidden rounded-xl bg-bg ${className}`}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          /*
            ⚠ loading="lazy" 를 쓰지 않는다. 이 이미지는 가로로 구르는 캐러셀
              안에, 다시 세로로 구르는 칸 안에 들어 있어서 브라우저의 게으른
              로딩이 "아직 화면 밖" 으로 보고 **아예 요청을 안 건다**. 그러면
              onError 도 영영 안 울려서 대체 로고로 물러나지도 못하고 슬롯이
              빈 채로 남는다 (실측: complete=false, naturalWidth=0 으로 고정).
              1층 카드는 많아야 서너 장이라 미리 받아도 부담이 없다.
          */
          // 주소는 있는데 404 나 핫링크 차단으로 안 뜨는 경우. 깨진 아이콘 대신 로고로 물러난다.
          onError={() => setFailed(true)}
          className={fit}
        />
      ) : (
        <FallbackLogo className={fit} />
      )}
    </div>
  );
}
