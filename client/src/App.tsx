import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatKoreanDate, isISODate, todayISO } from "@shared/date";
import { AppShell } from "./components/AppShell";
import { Button, LinkButton } from "./components/ui";
import { Setup } from "./Setup";
import { Home } from "./views/Home";
import { News } from "./views/News";
import { Settings } from "./views/Settings";
import { fetchBriefing, type BriefingResult } from "./lib/api";
import { clearConfig, loadConfig, type Config } from "./lib/config";
import { hrefFor, viewFromLocation, type ViewId } from "./lib/views";

/**
 * 날짜도 화면도 경로가 아니라 쿼리로 받는다 (?v=news&d=2026-08-24).
 * 정적 호스팅은 해당 경로에 파일이 없으면 404 를 내기 때문.
 */
function dateFromLocation(): string {
  const requested = new URLSearchParams(window.location.search).get("d");
  return requested && isISODate(requested) ? requested : todayISO();
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(() => loadConfig());
  const [editingConfig, setEditingConfig] = useState(false);
  const [result, setResult] = useState<BriefingResult | null>(null);

  const view = viewFromLocation(window.location.search);
  const date = dateFromLocation();
  const today = todayISO();

  const load = useCallback(
    async (active: Config) => {
      setResult(null);
      setResult(await fetchBriefing(active, date));
    },
    [date],
  );

  useEffect(() => {
    if (!config) return;
    // 설정 화면은 브리핑을 쓰지 않는다. 불필요한 요청을 보내지 않는다.
    if (view === "settings") return;
    void load(config);
  }, [config, load, view]);

  const reconnect = () => {
    clearConfig();
    setConfig(null);
  };

  if (!config || editingConfig) {
    return (
      <Setup
        current={config}
        onSaved={() => {
          setEditingConfig(false);
          setConfig(loadConfig());
        }}
        onCancel={config ? () => setEditingConfig(false) : undefined}
      />
    );
  }

  const briefing = result?.kind === "ok" ? result.briefing : null;

  return (
    <AppShell
      view={view}
      dateLabel={formatKoreanDate(date)}
      note={
        briefing?.generatedAt
          ? `${briefing.generatedAt} 에 정리했어요`
          : undefined
      }
      sample={briefing?.sample}
      date={date === today ? undefined : date}
    >
      {view === "settings" ? (
        <Settings
          config={config}
          onReconnect={reconnect}
          onConfigChanged={() => setConfig(loadConfig())}
        />
      ) : (
        <BriefingView
          view={view}
          result={result}
          date={date}
          today={today}
          onReconnect={reconnect}
        />
      )}
    </AppShell>
  );
}

/** 홈·뉴스는 같은 브리핑을 본다. 실패 처리도 같아서 한 군데로 모은다. */
function BriefingView({
  view,
  result,
  date,
  today,
  onReconnect,
}: {
  view: ViewId;
  result: BriefingResult | null;
  date: string;
  today: string;
  onReconnect: () => void;
}) {
  if (result === null) {
    return <Status title="불러오는 중이에요">서버에서 브리핑을 가져오고 있어요.</Status>;
  }

  if (result.kind === "unreachable") {
    return (
      <Status
        title="서버에 닿지 않아요"
        detail={`서버가 꺼져 있거나, 주소가 틀렸거나, 서버의 ALLOWED_ORIGINS 에 이 주소가 없을 수 있어요. (${result.message})`}
        action={<Button onClick={onReconnect}>연결 다시 설정</Button>}
      >
        브리핑을 가져올 서버에 연결하지 못했어요.
      </Status>
    );
  }

  if (result.kind === "unauthorized") {
    return (
      <Status
        title="인증되지 않았어요"
        detail="로그인이 만료됐거나 비밀번호·토큰이 바뀌었을 수 있어요."
        action={<Button onClick={onReconnect}>다시 연결</Button>}
      >
        서버가 이 연결을 거부했어요.
      </Status>
    );
  }

  const { briefing } = result;

  // 데이터가 없는 날. 아직 수집이 안 붙어서 대부분의 날짜가 여기로 온다.
  if (!briefing) {
    return (
      <Status
        title="브리핑이 없어요"
        detail="수집과 요약은 다음 단계에서 붙어요."
        action={
          date !== today ? (
            <LinkButton href={hrefFor(view, today)}>오늘로 가기 →</LinkButton>
          ) : undefined
        }
      >
        {formatKoreanDate(date)} 에는 아직 브리핑이 없어요.
      </Status>
    );
  }

  return view === "news" ? (
    <News briefing={briefing} date={date} today={today} />
  ) : (
    <Home briefing={briefing} date={date === today ? undefined : date} />
  );
}

function Status({
  title,
  detail,
  action,
  children,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-lg flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="text-sm">{children}</p>
      {detail ? <p className="text-xs leading-relaxed text-dim">{detail}</p> : null}
      {action}
    </div>
  );
}
