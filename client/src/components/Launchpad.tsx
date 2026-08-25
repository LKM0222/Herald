import type { LaunchItem } from "@shared/types";
import { Folder, Globe, Sunset, Zap } from "lucide-react";
import { Kicker, PendingButton, Tag } from "./ui";

const ICONS = {
  "작업 시작": Zap,
  "하루 마무리": Sunset,
  탐색기: Folder,
  크롬: Globe,
} as const;

/**
 * 런치패드.
 *
 * 도면(3A)에서 홈 오른쪽 스트립을 떠나 좌측 내비 아래로 내려갔다.
 * 그런데 좌측 내비는 PC 전용이라, 그대로 옮기면 모바일에서 통째로 사라진다.
 * 그래서 마운트 지점이 둘(내비 아래 · 홈 스트립 아래)이고 정의는 하나다.
 */
export function Launchpad({
  items,
  listClassName = "flex flex-col gap-1",
}: {
  items: LaunchItem[];
  /** 홈 스트립에선 좁아서 두 칸으로 깐다 */
  listClassName?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <Kicker>런치패드</Kicker>
      <div className={listClassName}>
        {items.map((item) => {
          const Icon = ICONS[item.label as keyof typeof ICONS] ?? Zap;
          return (
            <PendingButton
              key={item.id}
              title={item.label}
              className="justify-start"
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </PendingButton>
          );
        })}
      </div>
      <span className="self-start">
        <Tag>핸들러를 아직 안 깔았어요</Tag>
      </span>
    </section>
  );
}
