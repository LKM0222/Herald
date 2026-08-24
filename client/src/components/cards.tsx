import type { ContinueItem, LaunchItem, ScheduleItem } from "@shared/types";
import { Card, PendingButton } from "./Card";

export function ScheduleCard({ items }: { items: ScheduleItem[] }) {
  return (
    <Card title="📅 오늘 일정">
      {items.length === 0 ? (
        <p className="text-sm text-muted">일정 없음</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 text-sm">
              <span className="tabular-nums text-muted">{item.time}</span>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ContinueCard({ items }: { items: ContinueItem[] }) {
  return (
    <Card title="🧠 이어가기">
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.project} className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{item.project}</p>
            <p className="text-xs text-muted">어제 · {item.yesterday}</p>
            <p className="text-sm">다음 · {item.next}</p>
            <div className="mt-1">
              <PendingButton title="세션 열고 이어가기">⚡ 이어서</PendingButton>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function LaunchpadCard({ items }: { items: LaunchItem[] }) {
  return (
    <Card title="🚀 런치패드" meta="핸들러 미설치">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <PendingButton key={item.id} title={item.label}>
            {item.icon} {item.label}
          </PendingButton>
        ))}
      </div>
    </Card>
  );
}
