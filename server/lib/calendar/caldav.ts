import { XMLParser } from "fast-xml-parser";

/**
 * CalDAV 클라이언트 (읽기 전용).
 *
 * 네이버 캘린더는 구독용 iCal 주소를 내보내지 못한다. 한 번 받는 .ics 파일이거나
 * CalDAV 뿐이라, 계속 동기화하려면 이 길밖에 없다.
 *
 * ⚠ 그래서 서버가 **비밀번호를 계속 들고 있어야** 한다. OAuth 토큰이 아니다.
 *   반드시 애플리케이션 비밀번호를 쓴다 — 계정 비밀번호를 받는 경로는 만들지 않는다
 *   (CLAUDE.md 절대 규칙 3). 값은 secrets.ts 의 암호화 저장을 거쳐서만 들어온다.
 *
 * 여기서는 ICS 를 해석하지 않는다. 가져오기만 하고 파싱은 다음 단계 몫이다 —
 * 붙는 게 안 될 때 "인증이 문제인지 파싱이 문제인지" 헷갈리지 않게 갈라둔다.
 */

/** 네이버 CalDAV 진입점. Basic 인증을 요구한다(realm="Naver Calendar"). */
export const NAVER_CALDAV = "https://caldav.calendar.naver.com";

/** 느린 응답에 요청을 매달아 두지 않는다. 브리핑은 아침에 한 번 도는 배치다. */
const TIMEOUT_MS = 15_000;

export type Credentials = {
  /** 네이버 아이디 */
  user: string;
  /** 애플리케이션 비밀번호 */
  password: string;
  /** 기본값은 네이버. 다른 CalDAV 서버를 붙일 여지를 남겨둔다 */
  baseUrl?: string;
};

export type CalendarRef = {
  /** 절대 URL */
  url: string;
  /** 사람이 읽는 이름. 서버가 안 주면 URL 끝조각으로 대신한다 */
  name: string;
};

/**
 * 실패 종류를 나눠서 던진다.
 *
 * 화면이 "연결은 됐는데 일정이 없음"과 "붙지도 못함"을 구분해야 하기 때문이다.
 * 뭉뚱그리면 앱 비밀번호가 틀려도 그냥 빈 달력으로 보인다.
 */
export type FailureKind =
  | "auth" // 아이디·앱 비밀번호가 틀렸다
  | "network" // 못 닿았다 (DNS·타임아웃·TLS)
  | "protocol" // 닿았는데 CalDAV 답이 아니다
  | "not_found"; // 캘린더를 못 찾았다

export class CalDavError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CalDavError";
  }
}

/**
 * 네임스페이스 접두사를 벗겨서 파싱한다.
 *
 * 서버마다 D: · d: · ns0: 로 제각각이라 접두사를 그대로 두면 서버가 바뀔 때마다
 * 코드를 고쳐야 한다. 접두사를 지우면 지역명(`multistatus`, `href`)만 남는다.
 */
const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // 빈 태그(<calendar/>)가 존재 여부를 뜻하는 자리가 많다. 빈 문자열로 남겨야 판별된다.
  parseTagValue: false,
});

/** fast-xml-parser 는 항목이 하나면 배열을 벗긴다. 항상 배열로 받는다. */
function many<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function authHeader(credentials: Credentials): string {
  const raw = `${credentials.user}:${credentials.password}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

function originOf(credentials: Credentials): string {
  return credentials.baseUrl ?? NAVER_CALDAV;
}

/** 서버가 돌려주는 href 는 보통 경로만이라 원점을 붙여 절대 URL 로 만든다. */
function absolute(href: string, origin: string): string {
  return new URL(href, origin).toString();
}

type DavRequest = {
  method: "PROPFIND" | "REPORT";
  url: string;
  depth: "0" | "1";
  body: string;
};

async function dav(
  credentials: Credentials,
  request: DavRequest,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: {
        Authorization: authHeader(credentials),
        Depth: request.depth,
        "Content-Type": 'application/xml; charset="utf-8"',
      },
      body: request.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CalDavError("network", `서버에 닿지 못했어요 (${detail})`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new CalDavError(
      "auth",
      "아이디나 앱 비밀번호가 맞지 않아요",
      response.status,
    );
  }
  // CalDAV 성공은 207 Multi-Status 다. 200 도 받아준다.
  if (response.status !== 207 && response.status !== 200) {
    throw new CalDavError(
      "protocol",
      `예상하지 못한 응답이에요 (HTTP ${response.status})`,
      response.status,
    );
  }

  const text = await response.text();
  try {
    return parser.parse(text) as unknown;
  } catch {
    throw new CalDavError("protocol", "응답을 XML 로 읽지 못했어요");
  }
}

/** multistatus 안의 response 들을 평평하게 꺼낸다. */
function responsesOf(parsed: unknown): Record<string, unknown>[] {
  const root = parsed as { multistatus?: { response?: unknown } };
  return many(root?.multistatus?.response) as Record<string, unknown>[];
}

/**
 * response 하나에서 prop 을 꺼낸다.
 *
 * ⚠ propstat 은 여럿일 수 있다 — 찾은 속성은 200, 못 찾은 건 404 로 갈라서 온다.
 *   첫 번째만 보면 200 쪽을 놓칠 수 있어 전부 합친다.
 */
function propsOf(response: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const stat of many(response.propstat) as Record<string, unknown>[]) {
    Object.assign(merged, (stat.prop ?? {}) as Record<string, unknown>);
  }
  return merged;
}

/**
 * 요소의 글자 내용.
 *
 * ⚠ 속성이 붙은 요소는 문자열이 아니라 객체로 파싱된다.
 *   `<calendar-data content-type="text/calendar" version="2.0">…</calendar-data>` 가
 *   그렇다. 문자열만 받으면 값이 멀쩡히 왔는데도 전부 흘려버린다 —
 *   실제로 이것 때문에 일정 39건을 0건으로 읽었다.
 */
function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  const text = (value as { "#text"?: unknown } | undefined)?.["#text"];
  return typeof text === "string" ? text : null;
}

function hrefOf(value: unknown): string | null {
  const direct = textOf(value);
  if (direct !== null) return direct;
  const href = (value as { href?: unknown } | undefined)?.href;
  return textOf(href);
}

/**
 * 캘린더 목록을 찾는다.
 *
 * CalDAV 는 주소를 곧바로 알려주지 않는다. 세 걸음을 밟아야 한다:
 *   1. 진입점에서 현재 사용자의 principal
 *   2. principal 에서 캘린더 홈
 *   3. 홈을 Depth:1 로 훑어 실제 캘린더 컬렉션
 * 계정마다 경로가 달라서 이 절차를 건너뛰고 URL 을 박아두면 남의 계정에선 깨진다.
 */
export async function discoverCalendars(
  credentials: Credentials,
): Promise<CalendarRef[]> {
  const origin = originOf(credentials);

  // 1) principal
  const principalDoc = await dav(credentials, {
    method: "PROPFIND",
    url: `${origin}/`,
    depth: "0",
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  });

  const principalHref = responsesOf(principalDoc)
    .map((response) => hrefOf(propsOf(response)["current-user-principal"]))
    .find((href): href is string => Boolean(href));

  if (!principalHref) {
    throw new CalDavError("protocol", "계정 주소를 찾지 못했어요");
  }

  // 2) 캘린더 홈
  const homeDoc = await dav(credentials, {
    method: "PROPFIND",
    url: absolute(principalHref, origin),
    depth: "0",
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-home-set/></d:prop>
</d:propfind>`,
  });

  const homeHref = responsesOf(homeDoc)
    .map((response) => hrefOf(propsOf(response)["calendar-home-set"]))
    .find((href): href is string => Boolean(href));

  if (!homeHref) {
    throw new CalDavError("protocol", "캘린더 보관함을 찾지 못했어요");
  }

  // 3) 홈 아래 컬렉션들
  const listDoc = await dav(credentials, {
    method: "PROPFIND",
    url: absolute(homeHref, origin),
    depth: "1",
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`,
  });

  const calendars: CalendarRef[] = [];
  for (const response of responsesOf(listDoc)) {
    const href = hrefOf(response.href);
    if (!href) continue;

    const props = propsOf(response);
    const resourcetype = props.resourcetype as Record<string, unknown> | undefined;
    // 빈 <c:calendar/> 태그가 있으면 캘린더다. 홈 자신은 collection 이지만 calendar 는 아니다.
    if (!resourcetype || !("calendar" in resourcetype)) continue;
    if (!supportsEvents(props["supported-calendar-component-set"])) continue;

    const name = props.displayname;
    calendars.push({
      url: absolute(href, origin),
      name:
        typeof name === "string" && name.trim() !== ""
          ? name
          : decodeURIComponent(href.replace(/\/$/, "").split("/").pop() ?? "캘린더"),
    });
  }

  if (calendars.length === 0) {
    throw new CalDavError("not_found", "읽을 수 있는 캘린더가 없어요");
  }
  return calendars;
}

/**
 * 일정(VEVENT)을 담는 캘린더인지.
 *
 * 같은 홈에 할 일(VTODO) 전용 컬렉션이 섞여 있다. 속성을 안 주는 서버도 있어서,
 * 없으면 일단 캘린더로 본다 — 넘겨짚어 거르는 것보다 헛것을 한 번 더 읽는 게 낫다.
 */
function supportsEvents(value: unknown): boolean {
  if (!value) return true;
  const comps = many((value as { comp?: unknown }).comp) as {
    "@name"?: string;
  }[];
  if (comps.length === 0) return true;
  return comps.some((comp) => comp["@name"] === "VEVENT");
}

/**
 * 한국 날짜(YYYY-MM-DD)를 CalDAV 가 쓰는 UTC 표기로.
 *
 * 여기서는 toISOString 을 쓰는 게 맞다 — 날짜를 더하는 게 아니라 "서울 자정이라는
 * 순간"을 UTC 로 옮기는 것이고, CalDAV 의 time-range 는 순간을 요구한다.
 */
function utcStamp(date: string, endOfDay = false): string {
  const at = endOfDay ? "T23:59:59+09:00" : "T00:00:00+09:00";
  return new Date(`${date}${at}`)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * 기간 안의 일정을 ICS 원문으로 가져온다.
 *
 * 반복 일정은 여기서 펼치지 않는다. 서버는 RRULE 이 붙은 원본을 그대로 주고,
 * 펼치는 건 파서 몫이다 — 서버마다 펼쳐주는 정도가 달라서 믿을 수 없다.
 */
export async function fetchEventData(
  credentials: Credentials,
  calendarUrl: string,
  from: string,
  to: string,
): Promise<string[]> {
  const doc = await dav(credentials, {
    method: "REPORT",
    url: calendarUrl,
    depth: "1",
    body: `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${utcStamp(from)}" end="${utcStamp(to, true)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`,
  });

  const out: string[] = [];
  for (const response of responsesOf(doc)) {
    const data = textOf(propsOf(response)["calendar-data"]);
    if (data && data.includes("BEGIN:VEVENT")) out.push(data);
  }
  return out;
}

/**
 * 진단용. "일정이 없는 것"과 "조회가 안 먹는 것"을 가른다.
 *
 * 둘은 화면에서 똑같이 빈 달력으로 보이는데 원인이 정반대다. 세 가지를 각각
 * 세어 비교하면 어디가 막혔는지 한 번에 나온다:
 *   - 컬렉션에 놓인 리소스 수 (필터 없이 그냥 목록)
 *   - 기간 필터를 건 조회 결과 수
 *   - 기간 필터를 뺀 조회 결과 수
 * 리소스는 있는데 조회가 0 이면 필터가 범인이고, 리소스부터 0 이면 정말 빈 것이다.
 *
 * ⚠ 일정 **내용은 담지 않는다.** 진단 응답이 일정 덤프가 되면 안 된다.
 */
export type Probe = {
  calendar: string;
  resources: number;
  withRange: number;
  withoutRange: number;
  /** REPORT 가 돌려준 응답 줄 수. 이게 0 이면 서버가 아예 안 준 것이고,
   *  0 이 아닌데 위 숫자가 0 이면 우리가 못 꺼낸 것이다. */
  reportRows: number;
  /** 첫 줄의 **키 이름과 타입만**. 값은 담지 않는다 — 진단이 일정 덤프가 되면 안 된다. */
  shape?: string[];
  /** calendar-multiget 으로 본문을 받아왔는가 (앞의 몇 건만 시험) */
  multiget?: number;
  /** 리소스 URL 을 그냥 GET 했을 때. `상태/길이/VEVENT여부` */
  plainGet?: string;
  error?: string;
};

/** 값은 빼고 구조만 적는다. `이름:타입` 또는 `이름:{자식키…}` 꼴. */
function describeShape(value: unknown, depth = 0): string[] {
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).map(([key, child]) => {
    if (child === null || typeof child !== "object") {
      const size = typeof child === "string" ? `(${child.length}자)` : "";
      return `${key}:${typeof child}${size}`;
    }
    if (Array.isArray(child)) return `${key}:배열[${child.length}]`;
    if (depth >= 2) return `${key}:객체`;
    return `${key}:{${describeShape(child, depth + 1).join(" ")}}`;
  });
}

export async function probeCalendar(
  credentials: Credentials,
  calendar: CalendarRef,
  from: string,
  to: string,
): Promise<Probe> {
  const result: Probe = {
    calendar: calendar.name,
    resources: -1,
    withRange: -1,
    withoutRange: -1,
    reportRows: -1,
  };

  try {
    const listing = await dav(credentials, {
      method: "PROPFIND",
      url: calendar.url,
      depth: "1",
      body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getcontenttype/></d:prop></d:propfind>`,
    });
    // 컬렉션 자신도 한 줄로 끼어 있으므로 뺀다.
    result.resources = Math.max(0, responsesOf(listing).length - 1);

    result.withRange = (
      await fetchEventData(credentials, calendar.url, from, to)
    ).length;

    const all = await dav(credentials, {
      method: "REPORT",
      url: calendar.url,
      depth: "1",
      body: `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter>
  </c:filter>
</c:calendar-query>`,
    });
    const rows = responsesOf(all);
    result.reportRows = rows.length;
    if (rows[0]) result.shape = describeShape(rows[0]);

    // 네이버는 REPORT 에 200 을 주면서 prop 을 비워 보낸다. 본문을 받을 다른 길을 잰다.
    const hrefs = rows
      .map((row) => hrefOf(row.href))
      .filter((href): href is string => Boolean(href))
      .slice(0, 5);

    if (hrefs.length > 0) {
      const origin = originOf(credentials);
      const multi = await dav(credentials, {
        method: "REPORT",
        url: calendar.url,
        depth: "1",
        body: `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
${hrefs.map((href) => `  <d:href>${href}</d:href>`).join("\n")}
</c:calendar-multiget>`,
      });
      result.multiget = responsesOf(multi).filter((row) => {
        const data = textOf(propsOf(row)["calendar-data"]);
        return Boolean(data && data.includes("BEGIN:VEVENT"));
      }).length;

      const direct = await fetch(absolute(hrefs[0], origin), {
        headers: { Authorization: authHeader(credentials) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await direct.text();
      result.plainGet = `${direct.status}/${body.length}자/${
        body.includes("BEGIN:VEVENT") ? "VEVENT있음" : "VEVENT없음"
      }`;
    }
    result.withoutRange = rows.filter((response) => {
      const data = textOf(propsOf(response)["calendar-data"]);
      return Boolean(data && data.includes("BEGIN:VEVENT"));
    }).length;
  } catch (error) {
    result.error =
      error instanceof CalDavError ? `${error.kind}: ${error.message}` : String(error);
  }

  return result;
}
