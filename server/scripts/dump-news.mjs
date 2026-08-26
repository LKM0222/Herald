#!/usr/bin/env node
/**
 * 요약할 기사를 파일로 뽑는다.
 *
 * 요약(Claude)을 붙이기 전에, **무엇이 요약으로 넘어가는지** 눈으로 보고
 * 프롬프트를 손으로 시험해 보려고 만든 개발용 스크립트다.
 * 앱은 이 파일을 쓰지 않는다 — 서버는 lib/news/pending.ts 를 직접 부른다.
 *
 * 사용:
 *   node scripts/dump-news.mjs                        기본 소스 · 48시간
 *   node scripts/dump-news.mjs --hours=24
 *   node scripts/dump-news.mjs --sources=all
 *   node scripts/dump-news.mjs --sources=geeknews,hackernews
 *   node scripts/dump-news.mjs --out="C:/Users/.../news"
 *   node scripts/dump-news.mjs --include-summarized     이미 요약한 것도 담는다
 *
 * ⚠ 이 스크립트는 seen 기록을 **읽기만 한다.** 뽑아본 것을 요약했다고
 *   표시해 버리면, 정작 진짜 요약이 돌 때 그 기사들이 통째로 빠진다.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, "..");
const ROOT = path.resolve(SERVER, "..");
const DEFAULT_OUT = "C:/Users/pytho/Desktop/news";

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, value = "true"] = raw.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

const outDir = path.resolve(args.get("out") ?? DEFAULT_OUT);
const hours = Number(args.get("hours") ?? 48);
const includeSummarized = args.get("include-summarized") === "true";

/*
  tsx 같은 러너를 새로 넣지 않으려고 로컬 tsc 로 한 번 뽑아 쓴다.
  node_modules 안에 뽑는 이유는 하나다 — 거기 있어야 bare import
  (fast-xml-parser) 가 평소처럼 해석된다. commonjs 로 뽑는 것도 같은 이유로,
  ESM 이면 상대경로마다 .js 를 붙여줘야 한다.
*/
const BUILD = path.join(SERVER, "node_modules", ".herald-dump");
// .bin/tsc 는 셸 스크립트라 윈도우에서 바로 실행되지 않는다. 노드로 직접 부른다.
const TSC = path.join(SERVER, "node_modules", "typescript", "bin", "tsc");

rmSync(BUILD, { recursive: true, force: true });

const sources = [
  "server/lib/news/pending.ts",
  "server/lib/news/collect.ts",
  "server/lib/news/image.ts",
  "server/lib/news/origin.ts",
  "server/lib/news/url.ts",
  "server/lib/news/seen.ts",
  "server/lib/settings.ts",
  "shared/sources.ts",
].map((rel) => path.join(ROOT, rel));

try {
  execFileSync(
    process.execPath,
    [
      TSC,
      ...sources,
      "--outDir", BUILD,
      "--target", "es2022",
      "--module", "commonjs",
      "--moduleResolution", "node",
      // 없으면 `import path from "node:path"` 가 undefined 로 온다.
      "--esModuleInterop",
      "--skipLibCheck",
      "--rootDir", ROOT,
    ],
    { stdio: "pipe" },
  );
} catch (error) {
  /*
    tsc 는 타입 오류가 나도 파일은 뽑는다. 여기서 잡히는 건 대부분
    별칭(@shared/…)과 @types/node 를 못 찾는다는 것인데, 앞은 아래에서 직접
    바꾸고 뒤는 실행에 지장이 없다. **파일이 안 나왔을 때만** 진짜 실패다.
  */
  if (!existsSync(BUILD)) {
    console.error("tsc 실패:\n" + String(error.stdout ?? error.message ?? error));
    process.exit(1);
  }
}

// 별칭을 상대경로로 바꾼다. 깊이가 파일마다 달라서 계산해서 넣는다.
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

// seen 기록은 뽑는 폴더에서 읽는다. 없으면 빈 기록으로 시작한다.
process.env.HERALD_DATA_DIR ??= outDir;

const require_ = createRequire(import.meta.url);
const { pending } = require_(path.join(BUILD, "server/lib/news/pending.js"));
const { CATALOG } = require_(path.join(BUILD, "shared/sources.js"));

const asked = args.get("sources");
const enabled =
  asked === "all"
    ? CATALOG.map((source) => source.id)
    : asked
      ? asked.split(",").map((id) => id.trim())
      : undefined; // 설정 파일 → 없으면 기본 세 곳

const started = Date.now();
const result = await pending({ enabled, hours, includeSummarized });
const ms = Date.now() - started;

const now = new Date();
const stamp =
  now.toISOString().slice(0, 10).replace(/-/g, "") +
  "-" +
  now.toTimeString().slice(0, 5).replace(":", "");

mkdirSync(outDir, { recursive: true });
const mdPath = path.join(outDir, `news-${stamp}.md`);
const jsonPath = path.join(outDir, `news-${stamp}.json`);

writeFileSync(mdPath, markdown(result, now, ms), "utf8");
writeFileSync(
  jsonPath,
  JSON.stringify({ collectedAt: now.toISOString(), ...result }, null, 2),
  "utf8",
);

rmSync(BUILD, { recursive: true, force: true });

console.log(`\n=== 소스별 (${result.hours}시간 창) ===`);
console.log(
  "소스".padEnd(16) + "상태".padEnd(6) + "전체".padStart(6) +
  "기간내".padStart(7) + "날짜없음".padStart(9) + "잘림".padStart(6) + "ms".padStart(7),
);
for (const r of result.reports) {
  console.log(
    r.name.padEnd(16) + (r.ok ? "ok" : "실패").padEnd(6) +
    String(r.total).padStart(6) + String(r.fresh).padStart(7) +
    String(r.undated).padStart(9) + String(r.trimmed).padStart(6) +
    String(r.ms).padStart(7) + (r.error ? "  " + r.error : ""),
  );
}
const o = result.origins;
console.log(
  `\n원본 주소 복원 ${o.resolved}건` +
  ` (캐시 ${o.cached} · 자체글 ${o.selfPost} · 실패 ${o.failed} · ${o.ms}ms)` +
  ` · 같은 기사라 합침 ${result.merged}건`,
);
console.log(
  `요약할 기사 ${result.items.length}건` +
  ` · 이미 요약해서 뺌 ${result.skipped}건` +
  ` · 상한으로 버림 ${result.dropped}건 · ${ms}ms`,
);
console.log(`\n${mdPath}`);
console.log(jsonPath);

function markdown(result, now, ms) {
  const lines = [];
  lines.push(`# 요약 대기 기사 — ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`);
  lines.push("");
  lines.push(`- 수집 창: 최근 **${result.hours}시간**`);
  lines.push(`- 요약할 기사: **${result.items.length}건**`);
  lines.push(`- 이미 요약해서 제외: ${result.skipped}건`);
  lines.push(`- 상한으로 버림: ${result.dropped}건`);
  lines.push(`- 같은 기사라 합침: **${result.merged}건**`);
  lines.push(
    `- 원본 주소 복원: ${result.origins.resolved}건` +
    ` (캐시 ${result.origins.cached} · 자체글 ${result.origins.selfPost} · 실패 ${result.origins.failed})`,
  );
  lines.push(`- 수집 시간: ${ms}ms`);
  lines.push("");
  lines.push("| 소스 | 피드 전체 | 기간 내 | 날짜 없음 | 잘림 | ms | 비고 |");
  lines.push("|---|---:|---:|---:|---:|---:|---|");
  for (const r of result.reports) {
    lines.push(
      `| ${r.name} | ${r.total} | ${r.fresh} | ${r.undated} | ${r.trimmed} | ${r.ms} | ${r.error ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  result.items.forEach((item, index) => {
    const ago = Math.round((Date.now() - Date.parse(item.publishedAt)) / 3600_000);
    lines.push(`## ${index + 1}. ${item.title}`);
    lines.push("");
    lines.push(`- id: \`${item.id}\``);
    lines.push(`- 출처: ${item.source} · ${ago}시간 전`);
    lines.push(`- 주소: ${item.url}`);
    if (item.alsoIn?.length) {
      lines.push(`- 같은 글 다른 경로: ${item.alsoIn.map((a) => a.source).join(", ")}`);
    }
    if (item.excerpt) {
      lines.push("");
      lines.push(`> ${item.excerpt}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}
