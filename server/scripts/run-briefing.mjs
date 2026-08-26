#!/usr/bin/env node
/**
 * 브리핑을 **손으로** 한 번 만든다.
 *
 * ⚠ **이 스크립트는 토큰을 쓴다.** dump-news.mjs 와 결정적으로 다른 점이다.
 *   저쪽은 "무엇이 요약으로 넘어가는지" 를 공짜로 보여주고, 이쪽은 실제로
 *   Anthropic 을 부르고 브리핑을 저장한다. 그래서 --yes 없이는 안 돈다.
 *
 * 왜 필요한가: 스케줄러(scheduler.ts)는 하루에 한 번만 돈다. 그날 이미 돌았으면
 * 설정을 바꿔도 내일까지 기다려야 한다. 소스를 새로 켜거나 프롬프트를 고친 뒤
 * **지금 결과를 보고 싶을 때** 쓴다.
 *
 * 사용 (서버 컨테이너 안에서):
 *   docker exec herald node scripts/run-briefing.mjs --yes
 *   docker exec herald node scripts/run-briefing.mjs --yes --all   이미 요약한 것도 다시
 *
 * --all 은 seen 기록을 무시하고 그날 수집분 전체를 다시 요약한다. 하루치 전체
 * 비용을 재거나, 프롬프트를 바꾼 결과를 같은 기사로 견줄 때 쓴다. 평소에는
 * 붙이지 않는다 — 어제 본 기사가 다시 올라온다.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, "..");
const ROOT = path.resolve(SERVER, "..");

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, value = "true"] = raw.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

if (args.get("yes") !== "true") {
  console.error(
    "이 스크립트는 Anthropic API 를 부릅니다 (과금).\n" +
      "정말 돌리려면 --yes 를 붙이세요.\n\n" +
      "  node scripts/run-briefing.mjs --yes\n" +
      "  node scripts/run-briefing.mjs --yes --all\n",
  );
  process.exit(1);
}

const BUILD = path.join(SERVER, "node_modules", ".herald-run");
const TSC = path.join(SERVER, "node_modules", "typescript", "bin", "tsc");

rmSync(BUILD, { recursive: true, force: true });

/* dump-news.mjs 와 같은 방식이다 — 러너를 새로 넣지 않으려고 로컬 tsc 로 한 번
   뽑아 쓴다. node_modules 안에 뽑아야 bare import(fast-xml-parser)가 평소처럼
   해석되고, commonjs 로 뽑아야 상대경로에 .js 를 안 붙여도 된다. */
const sources = [
  "server/lib/news/run.ts",
  "server/lib/news/pending.ts",
  "server/lib/news/collect.ts",
  "server/lib/news/summarize.ts",
  "server/lib/news/article.ts",
  "server/lib/news/image.ts",
  "server/lib/news/origin.ts",
  "server/lib/news/url.ts",
  "server/lib/news/seen.ts",
  "server/lib/news/interests.ts",
  "server/lib/briefing/store.ts",
  "server/lib/secrets.ts",
  "server/lib/crypto.ts",
  "server/lib/settings.ts",
  "shared/sources.ts",
].map((rel) => path.join(ROOT, rel));

try {
  execFileSync(
    process.execPath,
    [
      TSC, ...sources,
      "--outDir", BUILD,
      "--target", "es2022",
      "--module", "commonjs",
      "--moduleResolution", "node",
      "--esModuleInterop",
      "--skipLibCheck",
      "--rootDir", ROOT,
    ],
    { stdio: "pipe" },
  );
} catch (error) {
  // tsc 는 타입 오류가 나도 파일은 뽑는다. 파일이 안 나왔을 때만 진짜 실패다.
  if (!existsSync(BUILD)) {
    console.error("tsc 실패:\n" + String(error.stdout ?? error.message ?? error));
    process.exit(1);
  }
}

// 별칭을 상대경로로 바꾼다. 깊이가 파일마다 달라 계산해서 넣는다.
function rewrite(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewrite(full);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    let shared = path
      .relative(path.dirname(full), path.join(BUILD, "shared"))
      .replace(/\\/g, "/");
    if (!shared.startsWith(".")) shared = "./" + shared;
    writeFileSync(full, readFileSync(full, "utf8").replaceAll("@shared/", shared + "/"));
  }
}
rewrite(BUILD);

const require_ = createRequire(import.meta.url);
const { runBriefing } = require_(path.join(BUILD, "server/lib/news/run.js"));

/** 한국 시간 기준 날짜. 컨테이너는 UTC 라 그냥 today 를 쓰면 하루가 어긋난다 */
const date =
  args.get("date") ??
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

const all = args.get("all") === "true";
console.log(`${date} 브리핑을 만듭니다${all ? " (이미 요약한 것도 다시)" : ""}…\n`);

const result = await runBriefing(date, { includeSummarized: all });

if (!result.ok) {
  console.error(`실패: ${result.reason} (${(result.ms / 1000).toFixed(1)}초)`);
  process.exit(1);
}

const { usage } = result;

/* 단가는 docs 의 공개값이다 (2026-08 · claude-sonnet-5).
   ⚠ 모델을 바꾸면 여기도 바꿔야 한다. 값이 틀리면 조용히 틀린 청구서가 나온다. */
const PRICE = { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.2 };
const cost = (n, per) => (n / 1_000_000) * per;
const total =
  cost(usage.input, PRICE.input) +
  cost(usage.output, PRICE.output) +
  cost(usage.cacheWrite, PRICE.cacheWrite) +
  cost(usage.cacheRead, PRICE.cacheRead);

console.log(`끝났습니다 · ${result.count}건 · ${(result.ms / 1000).toFixed(1)}초\n`);

console.log("영역별");
for (const area of result.areas) {
  const line = area.error
    ? `실패 — ${area.error}`
    : `수집 ${String(area.collected).padStart(3)} → 올림 ${String(area.kept).padStart(2)} · 원문 ${area.deep}`;
  console.log(`  ${area.label.padEnd(4)} ${line}`);
  if (area.headline) console.log(`       ${area.headline}`);
}

console.log("\n토큰");
console.log(`  입력      ${usage.input.toLocaleString().padStart(9)}   $${cost(usage.input, PRICE.input).toFixed(4)}`);
console.log(`  출력      ${usage.output.toLocaleString().padStart(9)}   $${cost(usage.output, PRICE.output).toFixed(4)}`);
console.log(`  캐시 쓰기  ${usage.cacheWrite.toLocaleString().padStart(9)}   $${cost(usage.cacheWrite, PRICE.cacheWrite).toFixed(4)}`);
console.log(`  캐시 읽기  ${usage.cacheRead.toLocaleString().padStart(9)}   $${cost(usage.cacheRead, PRICE.cacheRead).toFixed(4)}`);
console.log(`\n  합계      $${total.toFixed(4)}   (30일이면 $${(total * 30).toFixed(2)})`);

if (result.notes.length > 0) {
  console.log("\n사람이 볼 것");
  for (const note of result.notes) console.log(`  · ${note}`);
}

rmSync(BUILD, { recursive: true, force: true });
