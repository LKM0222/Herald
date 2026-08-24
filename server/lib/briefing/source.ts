import { todayISO } from "@shared/date";
import type { Briefing } from "@shared/types";

/**
 * 브리핑 한 건을 가져온다. 없으면 null.
 *
 * ★ 실데이터 교체 지점 ★
 * 지금은 더미를 돌려주지만, 나중에 여기만 DB(SQLite) 조회로 바꾸면 된다.
 * 화면 컴포넌트는 Briefing 타입만 알고 출처를 모르므로 손대지 않는다.
 */
export async function getBriefing(date: string): Promise<Briefing | null> {
  if (date !== todayISO()) return null;
  return { ...SAMPLE, date, news: SAMPLE.news.map(withFreshTime) };
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
 * ⚠ 전부 가짜다. 실제 기사가 아니다.
 *
 * 화면 형태를 잡기 위한 것이므로 `sample: true` 로 표시해서
 * 화면이 "샘플"이라고 말하게 한다 — 진짜 브리핑으로 오해되면 안 된다.
 * `publishedAt` 은 "몇 시간 전"을 뜻하는 숫자이고 위에서 실제 시각으로 바뀐다.
 */
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
    { id: "s1", time: "10:00", title: "[샘플] 일정" },
    { id: "s2", time: "14:00", title: "[샘플] 일정" },
  ],
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
