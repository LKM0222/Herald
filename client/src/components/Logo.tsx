import markDark from "../assets/mark-dark.png";
import markLight from "../assets/mark-light.png";
import lockupDark from "../assets/lockup-dark.png";
import lockupLight from "../assets/lockup-light.png";

/**
 * 두 벌을 다 렌더하고 CSS 로 한쪽을 감춘다.
 *
 * JS 로 고르지 않는 이유: 테마는 첫 페인트 전에 인라인 스크립트가 확정하는데,
 * 로고만 React 를 기다리면 잘못된 쪽이 한 번 스쳐 지나간다.
 * 감추는 규칙은 index.css 의 [data-logo] 선택자에 있다.
 *
 * `mark` 는 수탉만, `lockup` 은 수탉 + Herald 글자.
 * 헤더처럼 작은 자리엔 mark 를 쓴다 — 28px 에서 워드마크는 읽히지 않는다.
 *
 * 두 변형의 가로세로비가 달라서 높이로만 크기를 정한다 (`h-*` + `w-auto`).
 */
const SOURCES = {
  mark: { light: markLight, dark: markDark },
  lockup: { light: lockupLight, dark: lockupDark },
} as const;

export function Logo({
  variant = "mark",
  className = "",
}: {
  variant?: keyof typeof SOURCES;
  className?: string;
}) {
  const source = SOURCES[variant];
  return (
    <>
      <img data-logo="light" src={source.light} alt="Herald" className={className} />
      <img data-logo="dark" src={source.dark} alt="Herald" className={className} />
    </>
  );
}
