import { shiftISO, todayISO, weekdayIndex } from "@shared/date";
import type { Briefing } from "@shared/types";
import { loadBriefing, savedDates } from "./store";

/**
 * 브리핑 한 건을 가져온다. 없으면 null.
 *
 * 실제로 만들어진 게 있으면 그걸 준다 — 자동 실행(scheduler.ts)이 저장해 둔 것이다.
 *
 * 오늘 것이 없으면 **가장 최근에 만들어진 것**을 대신 준다. 자동 실행은 아침에
 * 도는데(기본 08:30) 한국 날짜는 자정에 넘어간다 — 그 사이 여덟 시간 반 동안
 * 오늘 것은 없다. 그때 빈 화면을 주면 어제 읽던 것마저 사라지고, 더미를 주면
 * 가짜 기사가 그 자리를 차지한다. 어제 것을 그대로 두는 쪽이 둘 다보다 낫다.
 *
 * ⚠ 대신 나온 것에는 standInFor 가 붙는다. 화면이 그걸 드러내야
 *   어제 기사를 오늘 기사로 읽지 않는다. date 는 안 건드린다 —
 *   그 값이 곧 "화면에 뭐라고 적을 날짜" 다.
 *
 * 한 번도 안 돌았을 때만 더미다. 그때는 대신 줄 것 자체가 없다.
 *
 * ⚠ 더미에는 sample: true 가 붙어 있다. 화면이 그걸 드러내야
 *   "오늘 뉴스가 이것뿐인가" 로 잘못 읽히지 않는다.
 */
export async function getBriefing(date: string): Promise<Briefing | null> {
  const saved = loadBriefing(date);
  if (saved) return saved;

  if (date !== todayISO()) return null;

  /* savedDates() 는 최신순이라 첫 번째로 걸리는 게 바로 전날치다.
     어제가 비어 있어도(서버가 꺼져 있던 날) 그 앞으로 계속 거슬러 간다. */
  const previous = savedDates().find((day) => day < date);
  if (previous) {
    const older = loadBriefing(previous);
    if (older) return { ...older, standInFor: date };
  }

  return {
    ...SAMPLE,
    date,
    news: SAMPLE.news.map(withFreshTime),
    week: sampleWeek(date),
    upcoming: sampleUpcoming(date),
  };
}

/**
 * 더미의 발행 시각을 오늘로 끌어온다.
 * 고정 날짜로 두면 화면에 "180일 전"이 뜨는데, 그건 시간 표기가 고장 난 것처럼 보인다.
 */
function withFreshTime<T extends { publishedAt: string }>(item: T): T {
  const hoursAgo = Number(item.publishedAt);
  return {
    ...item,
    publishedAt: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
  };
}

/**
 * 이번 주 일곱 칸. 일요일부터 시작한다.
 * 캘린더가 붙으면 이 함수가 실제 조회로 바뀐다.
 */
function sampleWeek(date: string): Briefing["week"] {
  const start = shiftISO(date, -weekdayIndex(date));
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftISO(start, index);
    return { date: day, count: day === date ? 2 : 0 };
  });
}

function sampleUpcoming(date: string): Briefing["upcoming"] {
  return [
    {
      id: "u1",
      date: shiftISO(date, 1),
      time: "11:00",
      endTime: "12:00",
      title: "[샘플] 일정",
    },
    {
      id: "u2",
      date: shiftISO(date, 3),
      time: "",
      title: "[샘플] 종일 일정",
      allDay: true,
    },
  ];
}

const SAMPLE: Briefing = {
  date: "",
  sample: true,
  generatedAt: "08:30",
  headline: "샘플 6건 — 실제 수집은 아직 붙지 않았습니다.",
  news: [
    {
      id: "n1",
      title: "[샘플] Model context window expanded",
      url: "https://example.com/sample-1",
      source: "샘플 매체 A",
      publishedAt: "3",
      topic: "AI 모델",
      priority: 1,
      summary: "모델 컨텍스트 한도가 크게 늘었다는 가상의 발표",
      relevance: "요약 단계에서 기사를 잘라 넣는 처리를 안 해도 될 수 있다",
      alsoIn: [
        { source: "샘플 매체 B", url: "https://example.com/sample-1b" },
        { source: "샘플 매체 C", url: "https://example.com/sample-1c" },
      ],
    },
    {
      id: "n2",
      title: "[샘플] Coding agent benchmark results",
      url: "https://example.com/sample-2",
      source: "샘플 매체 B",
      publishedAt: "5",
      topic: "AI 코딩",
      priority: 1,
      summary: "코딩 에이전트 벤치마크가 공개됐다는 가상의 소식",
      relevance: "Herald 의 요약 품질을 어떤 기준으로 볼지 참고가 된다",
    },
    {
      id: "n3",
      title: "[샘플] Runtime 34 released",
      url: "https://example.com/sample-3",
      source: "샘플 매체 C",
      publishedAt: "9",
      topic: "개발 도구",
      priority: 2,
      summary: "런타임 메이저 버전이 나왔다는 가상의 릴리스 소식",
    },
    {
      id: "n4",
      title: "[샘플] Framework routing convention changed",
      url: "https://example.com/sample-4",
      source: "샘플 매체 A",
      publishedAt: "14",
      topic: "개발 도구",
      priority: 2,
      summary: "프레임워크 라우팅 규약이 바뀌었다는 가상의 공지",
    },
    {
      id: "n5",
      title: "[샘플] Running SQLite in production",
      url: "https://example.com/sample-5",
      source: "샘플 매체 D",
      publishedAt: "20",
      topic: "자체 호스팅",
      priority: 3,
      summary: "SQLite 운영 팁을 다룬 가상의 글",
    },
    {
      id: "n6",
      title: "[샘플] Weekly roundup",
      url: "https://example.com/sample-6",
      source: "샘플 매체 D",
      publishedAt: "26",
      topic: "기타",
      priority: 3,
      summary: "주간 정리 성격의 가상의 글",
    },
  ],
  schedule: [
    { id: "s1", time: "10:00", endTime: "11:00", title: "[샘플] 일정" },
    { id: "s2", time: "14:00", endTime: "15:00", title: "[샘플] 일정" },
  ],
  // 아래 둘은 getBriefing 이 날짜에 맞춰 다시 채운다.
  upcoming: [],
  week: [],
  continues: [
    {
      project: "Herald",
      yesterday: "오라클 배포와 HTTPS, 테마·로고까지",
      next: "RSS 수집 붙이기",
    },
  ],
  launchpad: [
    { id: "l1", icon: "⚡", label: "작업 시작", kind: "routine" },
    { id: "l2", icon: "🌆", label: "하루 마무리", kind: "routine" },
    { id: "l3", icon: "📁", label: "탐색기", kind: "app" },
    { id: "l4", icon: "🌐", label: "크롬", kind: "app" },
  ],
};
