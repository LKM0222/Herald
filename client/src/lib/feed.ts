import { useEffect, useState } from "react";
import {
  describeFailure,
  fetchCalendarEvents,
  type CalendarEventsResult,
  type CalendarFailure,
} from "./api";
import type { CalendarEvent } from "@shared/types";
import type { Config } from "./config";

/**
 * 캘린더에서 실제로 읽어온 일정.
 *
 * "아직 안 붙였다(off)" 와 "붙였는데 다 꺼뒀다(paused)" 와 "붙였는데
 * 비었다(live · 0건)" 와 "가져오다 실패했다" 를 갈라 둔다. 넷 다 화면에는
 * 빈 달력으로 보이지만 사용자가 할 일이 전부 다르다 — 하나로 뭉뚱그리면
 * 주소가 틀린 걸 한가한 달로 읽는다.
 *
 * 홈의 미니 달력과 일정 탭이 같은 훅을 쓴다. 각자 받아오게 두면 한쪽만
 * 실데이터, 다른 쪽은 샘플인 상태가 조용히 생긴다.
 */
export type Feed =
  | { state: "loading" }
  | { state: "off" }
  /** 붙어는 있다. 사용자가 체크를 다 꺼서 조회를 안 할 뿐이다 */
  | { state: "paused" }
  | {
      state: "live";
      calendars: string[];
      events: CalendarEvent[];
      failed: CalendarFailure[];
    }
  | { state: "error"; message: string };

/**
 * reloadKey 는 "같은 기간을 다시 받아와라" 는 신호다.
 *
 * 캘린더 체크를 껐다 켜면 config 도 기간도 그대로여서 useEffect 가 안 돈다 —
 * 체크는 움직였는데 달력은 그대로인 상태가 된다. 숫자를 올려 그때만 다시
 * 받아온다. 안 넘기면 예전과 똑같이 동작한다(홈이 그렇다).
 */
export function useCalendarFeed(
  config: Config,
  from: string,
  to: string,
  reloadKey = 0,
): Feed {
  const [feed, setFeed] = useState<Feed>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    setFeed({ state: "loading" });
    void fetchCalendarEvents(config, from, to).then((result) => {
      if (!cancelled) setFeed(toFeed(result));
    });
    return () => {
      cancelled = true;
    };
  }, [config, from, to, reloadKey]);

  return feed;
}

function toFeed(result: CalendarEventsResult): Feed {
  if (result.kind !== "ok") {
    return { state: "error", message: describeFailure(result) };
  }
  if (!result.configured) return { state: "off" };
  if (result.paused) return { state: "paused" };
  return {
    state: "live",
    calendars: result.calendars,
    events: result.events,
    failed: result.failed,
  };
}

/** 화면에 알려야 할 문제들. 없으면 빈 배열. */
export function troubles(feed: Feed): { label: string; message: string }[] {
  if (feed.state === "error") {
    return [{ label: "캘린더", message: feed.message }];
  }
  if (feed.state === "live") {
    return feed.failed.map((item) => ({
      label: item.label,
      message: item.message,
    }));
  }
  return [];
}
