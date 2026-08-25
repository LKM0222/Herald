/**
 * 서버가 뜰 때 한 번 도는 곳. Next 가 정해둔 이름이라 바꾸면 안 불린다.
 *
 * 여기 있는 이유: 매일 정해진 시각에 브리핑을 만들려면 **요청이 없어도 도는
 * 무언가**가 필요하다. 라우트 핸들러는 누가 열어야 돌기 때문에, 아침 7시에
 * 아무도 앱을 안 열면 브리핑이 안 만들어진다.
 */
export async function register(): Promise<void> {
  // edge 런타임에도 이 파일이 불린다. 파일 시스템과 타이머는 node 에서만 쓴다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("./lib/news/scheduler");
  startScheduler();
}
