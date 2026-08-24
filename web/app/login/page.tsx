import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { todayISO } from "@/lib/date";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect(`/d/${todayISO()}`);

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl leading-none">🐓</span>
          <h1 className="text-xl font-semibold tracking-tight">Herald</h1>
          <p className="text-sm text-muted">매일 아침, 하루를 여는 전령.</p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: `/d/${todayISO()}` });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-accent px-4 font-medium text-white"
          >
            디스코드로 계속하기
          </button>
        </form>

        <p className="text-xs text-muted">
          허용된 계정만 들어올 수 있습니다.
        </p>
      </div>
    </main>
  );
}
