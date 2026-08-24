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
  return { ...SAMPLE, date };
}

const SAMPLE: Briefing = {
  date: "",
  generatedAt: "08:30",
  headline: "오늘 12건 중 3건이 내 프로젝트와 관련 있습니다.",
  news: [
    {
      id: "n1",
      category: "AI",
      title: "Anthropic, 컨텍스트 확장 발표",
      url: "https://www.anthropic.com/news",
    },
    {
      id: "n2",
      category: "AI",
      title: "OpenAI 신모델 벤치마크 공개",
      url: "https://openai.com/news",
    },
    {
      id: "n3",
      category: "개발",
      title: "Electron 34 릴리스",
      url: "https://www.electronjs.org/blog",
      flagged: true,
      flagReason: "ClaudeHub 의 node-pty 에 영향 가능",
    },
    {
      id: "n4",
      category: "개발",
      title: "Next.js 16 의 proxy 규약 정리",
      url: "https://nextjs.org/blog",
    },
    {
      id: "n5",
      category: "자체호스팅",
      title: "SQLite 를 프로덕션에서 쓰는 법",
      url: "https://sqlite.org",
    },
  ],
  schedule: [
    { id: "s1", time: "10:00", title: "치과" },
    { id: "s2", time: "14:00", title: "팀 미팅" },
  ],
  continues: [
    {
      project: "Herald",
      yesterday: "리포 초기화와 Next.js·Docker 골격까지",
      next: "디스코드 웹훅 발송 붙이기",
    },
  ],
  launchpad: [
    { id: "l1", icon: "⚡", label: "작업 시작", kind: "routine" },
    { id: "l2", icon: "🌆", label: "하루 마무리", kind: "routine" },
    { id: "l3", icon: "📁", label: "탐색기", kind: "app" },
    { id: "l4", icon: "🌐", label: "크롬", kind: "app" },
  ],
};
