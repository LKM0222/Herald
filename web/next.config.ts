import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 도커 이미지를 얇게 만든다. 빌드가 실행에 필요한 것만 골라
  // .next/standalone 에 모아주고, Dockerfile 이 그것만 복사한다.
  output: "standalone",
};

export default nextConfig;
