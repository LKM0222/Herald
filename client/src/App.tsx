import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatKoreanDate, isISODate, todayISO } from "@shared/date";
import { AppShell } from "./components/AppShell";
import {
  LoadingPanel,
  LoadingProvider,
  StageReport,
} from "./components/Loading";
import { Button, LinkButton } from "./components/ui";
import { Setup } from "./Setup";
import { Home } from "./views/Home";
import { News } from "./views/News";
import { ScheduleView } from "./views/ScheduleView";
import { Settings } from "./views/Settings";
import { fetchBriefing, type BriefingResult } from "./lib/api";
import { clearConfig, loadConfig, type Config } from "./lib/config";
import { useLoading } from "./lib/loading";
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
    /*
      기다리는 표시는 셸(진행선 · 탭)과 가운데 칸 두 군데에 나뉘어 뜨는데,
      "지금 무엇을 기다리는가" 는 한 곳에서만 정해져야 한다 — 두 벌로 두면
      진행선은 도는데 가운데는 다 왔다고 말하는 상태가 생긴다.
    */
    <LoadingProvider view={view}>
      {/*
        브리핑 대기는 이 컴포넌트가 들고 있어서 여기서 신고한다.
        ⚠ 설정 탭은 브리핑을 아예 안 받는다 (위 useEffect 가 그냥 돌아간다).
          그 탭까지 "기다리는 중" 으로 세면 진행선이 영영 안 꺼진다.
      */}
      <StageReport
        stage="briefing"
        busy={view !== "settings" && result === null}
      />
      <AppShell
        view={view}
        /*
          머리줄의 날짜는 **실제로 담긴 기사의 날짜**다. 오늘 것이 아직 없어
          어제 것이 대신 올라온 날, 여기가 오늘을 이고 있으면 뉴스 화면의
          날짜 줄과 서로 다른 날을 말한다 — 둘 중 하나는 반드시 거짓말이다.
        */
        dateLabel={formatKoreanDate(briefing?.standInFor ? briefing.date : date)}
        note={
          briefing?.generatedAt
            ? `${briefing.generatedAt} 에 정리했어요`
            : undefined
        }
        sample={briefing?.sample}
        date={date === today ? undefined : date}
        launchpad={briefing?.launchpad}
        /*
          여백을 뷰가 직접 드는 건 **뉴스 본문이 실제로 그려질 때뿐**이다 —
          아래 BriefingView 가 <News/> 를 내주는 바로 그 조건이다.
          탭만 보고 넘기면, 같은 탭에서 기다리는 표시·안내 상자가 대신 설 때
          그것들까지 여백 0 이 되어 화면 왼쪽 위 모서리에 붙는다.
        */
        bleed={view === "news" && briefing !== null}
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
            config={config}
            onReconnect={reconnect}
          />
        )}
      </AppShell>
    </LoadingProvider>
  );
}

/** 홈·뉴스는 같은 브리핑을 본다. 실패 처리도 같아서 한 군데로 모은다. */
function BriefingView({
  view,
  result,
  date,
  today,
  config,
  onReconnect,
}: {
  view: ViewId;
  result: BriefingResult | null;
  date: string;
  today: string;
  /** 일정 화면은 브리핑과 별개로 캘린더를 직접 받아온다 */
  config: Config;
  onReconnect: () => void;
}) {
  if (result === null) return <LoadingCenter />;

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

  /*
    일정은 브리핑보다 먼저 본다.
    캘린더는 별개 출처라, 그날 뉴스 브리핑이 없다고 달력까지 막으면
    홈에서 일정을 눌러 그 날로 들어가는 길이 끊긴다.
  */
  if (view === "schedule") {
    return (
      <ScheduleView
        briefing={briefing}
        date={date}
        today={today}
        config={config}
      />
    );
  }

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

  if (view === "news") {
    return <News briefing={briefing} date={date} today={today} />;
  }
  return (
    <Home
      briefing={briefing}
      date={date === today ? undefined : date}
      config={config}
    />
  );
}

/**
 * 브리핑이 없으면 화면에 그릴 게 아무것도 없다. 그 자리에 지금 어느 단계인지를
 * 보여준다 (도면 8B · 9B 의 가운데 칸).
 *
 * ⚠ 250ms 를 못 넘기면 **아무것도 안 그린다.** 눈 깜빡할 사이에 끝나는 요청에
 *   안내 상자를 띄웠다 지우면 그 자리가 한 번 덜컥이는데, 그게 잠깐의 빈 칸보다
 *   훨씬 거슬린다.
 */
function LoadingCenter() {
  const { stages, show } = useLoading();
  if (!show) return null;
  return <LoadingPanel stages={stages} />;
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
    /*
      self-start — 이 상자가 뷰 루트 자리에 그대로 들어간다. <main> 은 lg 부터
      자식을 제 높이로 늘리는데(AppShell), 그건 본문·스트립을 따로 굴리는
      화면들 얘기다. 안 막으면 안내 한 줄짜리 상자가 화면 높이만큼 빈 테두리로
      늘어난다 (실측 1280px: 110px 이면 될 것이 715px).
    */
    <div className="flex max-w-lg flex-col items-start gap-3 self-start rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="text-sm">{children}</p>
      {detail ? <p className="text-xs leading-relaxed text-dim">{detail}</p> : null}
      {action}
    </div>
  );
}
