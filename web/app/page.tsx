import { redirect } from "next/navigation";
import { todayISO } from "@/lib/date";

// 루트는 늘 오늘 브리핑으로 보낸다. 날짜가 박힌 주소여야 나중에 다시 열 수 있다.
export default function Home() {
  redirect(`/d/${todayISO()}`);
}
