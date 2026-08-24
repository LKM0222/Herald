import { isAuthorized, json, preflight, unauthorized } from "@/lib/http";
import { readSettings, writeSettings } from "@/lib/settings";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);
  return json({ settings: readSettings() }, { origin });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAuthorized(request)) return unauthorized(origin);

  let enabledSources: string[] = [];
  try {
    const body = (await request.json()) as { enabledSources?: unknown };
    if (Array.isArray(body.enabledSources)) {
      enabledSources = body.enabledSources.filter(
        (id): id is string => typeof id === "string",
      );
    }
  } catch {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }

  // 모르는 id 는 writeSettings 가 걸러낸다. 저장된 결과를 그대로 돌려줘서
  // 화면이 자기가 보낸 값이 아니라 실제 저장된 값을 반영하게 한다.
  return json({ settings: writeSettings({ enabledSources }) }, { origin });
}

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}
