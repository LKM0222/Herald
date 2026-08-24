import { useCallback, useEffect, useState } from "react";
import { formatKoreanDate, isISODate, todayISO } from "@shared/date";
import { AppShell } from "./components/AppShell";
import { Card } from "./components/Card";
import {
  ContinueCard,
  LaunchpadCard,
  NewsCard,
  ScheduleCard,
} from "./components/cards";
import { Setup } from "./Setup";
import { fetchBriefing, type BriefingResult } from "./lib/api";
import { clearConfig, loadConfig, type Config } from "./lib/config";

/**
 * 날짜는 경로가 아니라 쿼리로 받는다 (?d=2026-08-24).
 * 정적 호스팅은 /d/2026-08-24 같은 경로에 해당 파일이 없으면 404 를 내기 때문.
 */
function dateFromLocation(): string {
  const requested = new URLSearchParams(window.location.search).get("d");
  return requested && isISODate(requested) ? requested : todayISO();
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(() => loadConfig());
  const [editingConfig, setEditingConfig] = useState(false);
  const [result, setResult] = useState<BriefingResult | null>(null);

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
    void load(config);
  }, [config, load]);

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
    <AppShell
      dateLabel={formatKoreanDate(date)}
      todayHref={`?d=${today}`}
      onOpenSettings={() => setEditingConfig(true)}
    >
      <Body
        result={result}
        date={date}
        today={today}
        onReconnect={() => {
          clearConfig();
          setConfig(null);
        }}
      />
    </AppShell>
  );
}

function Body({
  result,
  date,
  today,
  onReconnect,
}: {
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
      <Card title="🔑 토큰이 맞지 않음">
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm">서버가 이 토큰을 거부했습니다.</p>
          <p className="text-xs text-muted">
            서버의 API_TOKEN 과 같은 값인지 확인해 주세요.
          </p>
          <button
            type="button"
            onClick={onReconnect}
            className="min-h-11 rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
          >
            토큰 다시 입력
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
              href={`?d=${today}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm hover:border-accent hover:text-accent"
            >
              오늘로 가기 →
            </a>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{briefing.headline}</p>

      {/* PC 2단 · 모바일 1단. 카드는 그대로고 배치만 바뀐다. */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <NewsCard items={briefing.news} generatedAt={briefing.generatedAt} />

        <div className="flex flex-col gap-4">
          <ScheduleCard items={briefing.schedule} />
          <ContinueCard items={briefing.continues} />
        </div>

        <div className="lg:col-span-2">
          <LaunchpadCard items={briefing.launchpad} />
        </div>
      </div>
    </div>
  );
}
