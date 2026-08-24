import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * 접근을 허용할 디스코드 사용자 ID 목록.
 *
 * 비어 있으면 빈 배열을 돌려주고, 그 결과 아무도 로그인하지 못한다.
 * 설정 누락이 곧 전면 개방이 되면 안 되기 때문에 의도적으로 fail-closed 다.
 */
function allowedDiscordIds(): string[] {
  return (process.env.ALLOWED_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Discord],
  pages: { signIn: "/login" },
  callbacks: {
    /** 화이트리스트에 없는 계정은 로그인 자체를 거부한다. */
    signIn({ profile }) {
      const id = profile?.id;
      return typeof id === "string" && allowedDiscordIds().includes(id);
    },
  },
});
