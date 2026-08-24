import type { Briefing } from "@shared/types";
import type { Config } from "./config";

/**
 * 실패를 종류별로 구분해 돌려준다.
 * "주소가 틀렸다"와 "토큰이 틀렸다"와 "그날 데이터가 없다"는
 * 사용자가 해야 할 일이 전부 달라서, 하나의 오류로 뭉뚱그리면 안 된다.
 */
export type BriefingResult =
  | { kind: "ok"; briefing: Briefing | null }
  | { kind: "unauthorized" }
  | { kind: "unreachable"; message: string };

export async function fetchBriefing(
  config: Config,
  date: string,
): Promise<BriefingResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiBase}/api/briefing/${date}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
  } catch (error) {
    // 서버가 꺼져 있거나, 주소가 틀렸거나, CORS 가 막은 경우가 전부 여기로 온다.
    // 브라우저는 셋을 구분해 알려주지 않는다.
    return {
      kind: "unreachable",
      message: error instanceof Error ? error.message : "연결 실패",
    };
  }

  if (response.status === 401) return { kind: "unauthorized" };

  if (!response.ok) {
    return { kind: "unreachable", message: `서버 응답 ${response.status}` };
  }

  const body = (await response.json()) as { briefing: Briefing | null };
  return { kind: "ok", briefing: body.briefing };
}
