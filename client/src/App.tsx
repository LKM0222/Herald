import { useCallback, useEffect, useState } from "react";
import { formatKoreanDate, isISODate, todayISO } from "@shared/date";
import { AppShell } from "./components/AppShell";
import { Card } from "./components/Card";
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

  return (
    <AppShell view={view} dateLabel={formatKoreanDate(date)} date={date === today ? undefined : date}>
      {view === "settings" ? (
        <Settings config={config} onReconnect={reconnect} />
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
    return (
      <Card title="⏳ 불러오는 중">
        <p className="text-sm text-muted">서버에서 브리핑을 가져오고 있습니다.</p>
      </Card>
    );
  }

  if (result.kind === "unreachable") {
    return (
      <Card title="🔌 서버에 닿지 않음">
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm">브리핑을 가져올 서버에 연결하지 못했습니다.</p>
          <p className="text-xs text-muted">
            서버가 꺼져 있거나, 주소가 틀렸거나, 서버의 ALLOWED_ORIGINS 에 이
            주소가 없을 수 있습니다. ({result.message})
          </p>
          <button
            type="button"
            onClick={onReconnect}
            className="min-h-11 rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
          >
            연결 다시 설정
          </button>
        </div>
      </Card>
    );
  }

  if (result.kind === "unauthorized") {
    return (
      <Card title="🔑 인증되지 않음">
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm">서버가 이 연결을 거부했습니다.</p>
          <p className="text-xs text-muted">
            로그인이 만료됐거나 비밀번호·토큰이 바뀌었을 수 있습니다.
          </p>
          <button
            type="button"
            onClick={onReconnect}
            className="min-h-11 rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
          >
            다시 연결
          </button>
        </div>
      </Card>
    );
  }

  const { briefing } = result;

  // 데이터가 없는 날. 아직 수집이 안 붙어서 대부분의 날짜가 여기로 온다.
  if (!briefing) {
    return (
      <Card title="📭 브리핑 없음">
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm">
            {formatKoreanDate(date)} 에는 아직 브리핑이 없습니다.
          </p>
          <p className="text-xs text-muted">
            수집과 요약은 다음 단계에서 붙습니다.
          </p>
          {date !== today ? (
            <a
              href={hrefFor(view, today)}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
            >
              오늘로 가기 →
            </a>
          ) : null}
        </div>
      </Card>
    );
  }

  return view === "news" ? (
    <News briefing={briefing} date={date} today={today} />
  ) : (
    <Home briefing={briefing} date={date === today ? undefined : date} />
  );
}
