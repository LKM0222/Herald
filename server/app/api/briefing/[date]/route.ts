import { isISODate } from "@shared/date";
import { getBriefing } from "@/lib/briefing/source";
import { isAuthorized, json, preflight, unauthorized } from "@/lib/http";

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const origin = request.headers.get("origin");

  if (!isAuthorized(request)) return unauthorized(origin);

  const { date } = await params;
  if (!isISODate(date)) {
    return json({ error: "invalid date" }, { status: 400, origin });
  }

  const briefing = await getBriefing(date);

  // 그날 데이터가 없는 건 오류가 아니다. 아직 수집이 안 붙어서 대부분의 날짜가 여기로 온다.
  // 클라이언트가 404 를 고장으로 오해하지 않도록 200 + null 로 답한다.
  return json({ briefing }, { origin });
}
