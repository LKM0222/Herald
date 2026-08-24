import path from "node:path";
import type { NextConfig } from "next";

// shared/ 가 server/ 밖에 있어서, Next 의 프로젝트 루트를 리포 최상단으로 올린다.
// 이걸 안 하면 "@shared/*" 가 프로젝트 밖이라고 거부당한다.
const repoRoot = path.resolve(import.meta.dirname, "..");

const nextConfig: NextConfig = {
  // 도커 이미지를 얇게 만든다. 실행에 필요한 것만 .next/standalone 에 모인다.
  output: "standalone",

  turbopack: { root: repoRoot },
  // 파일 추적도 같은 루트를 봐야 shared/ 가 standalone 산출물에 들어간다.
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
