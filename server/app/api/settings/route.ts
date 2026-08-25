import {
  isAuthorized,
  json,
  preflight,
  storageError,
  unauthorized,
} from "@/lib/http";
import { readSettings, writeSettings, type Settings } from "@/lib/settings";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);
  return json({ settings: readSettings() }, { origin });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  let enabledSources: string[] = [];
  let schedule: Settings["schedule"];
  try {
    const body = (await request.json()) as {
      enabledSources?: unknown;
      schedule?: unknown;
    };
    if (Array.isArray(body.enabledSources)) {
      enabledSources = body.enabledSources.filter(
        (id): id is string => typeof id === "string",
      );
    }
    /* schedule 을 빼고 보낼 수 있다 — 소스 체크박스만 건드린 경우가 그렇다.
       그때 기본값으로 덮으면 켜둔 자동 실행이 조용히 꺼진다. 지금 값을 읽어 유지한다. */
    schedule = (body.schedule ?? readSettings().schedule) as Settings["schedule"];
  } catch {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }

  // 모르는 id 도 깨진 시각도 writeSettings 가 걸러낸다. 저장된 결과를 그대로
  // 돌려줘서 화면이 자기가 보낸 값이 아니라 실제 저장된 값을 반영하게 한다.
  try {
    return json(
      { settings: writeSettings({ enabledSources, schedule }) },
      { origin },
    );
  } catch (error) {
    return storageError(origin, error);
  }
}

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}
