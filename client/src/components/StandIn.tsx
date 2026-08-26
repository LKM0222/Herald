import { Clock } from "lucide-react";
import { formatKoreanDate } from "@shared/date";

/**
 * "이건 오늘 것이 아니다" 를 말하는 한 줄.
 *
 * 오늘 브리핑은 아침에 만들어진다(기본 08:30). 자정부터 그때까지 서버는
 * 가장 최근 것을 대신 내주는데(briefing.standInFor), 그 사실을 화면이 말하지
 * 않으면 **어제 기사를 오늘 기사로 읽게 된다.** 날짜 줄이 어제 날짜를 이고
 * 있어도 그것만으론 부족하다 — 날짜가 바뀐 걸 알아채는 사람은 드물다.
 *
 * ⚠ 이 줄은 **없을 때가 정상이다.** 하루 중 여덟 시간 반만 나온다.
 *   그래서 자리를 미리 비워 두지 않는다 — 늘 있는 것처럼 자리를 잡아 두면
 *   나머지 열다섯 시간 반 동안 빈 띠가 화면 높이를 먹는다.
 *
 * 바깥 모양(테두리 · 여백)은 쓰는 쪽이 준다. 뉴스는 붙박이 띠로, 홈은
 * 둥근 상자로 세운다 — 같은 말이지만 서 있는 자리가 달라서다.
 */
export function StandInNotice({
  shown,
  className = "",
}: {
  /** 실제로 화면에 담긴 기사의 날짜 */
  shown: string;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2 bg-accent-soft text-[12px] leading-snug text-accent-ink ${className}`}
    >
      <Clock size={14} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
      {/* break-keep — 좁은 화면에서 "정리되지" 가 낱글자로 쪼개지지 않게 */}
      <span className="min-w-0 break-keep">
        오늘의 뉴스가 아직 정리되지 않았어요 —{" "}
        <span className="font-semibold">{formatKoreanDate(shown)}</span> 것을
        보여드려요
      </span>
    </div>
  );
}
