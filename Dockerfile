# Herald API 서버. 화면(client/)은 여기 안 들어간다 — GitHub Pages 로 따로 나간다.
#
# 빌드 컨텍스트는 리포 루트다. shared/ 가 server/ 밖에 있어서
# 둘의 상대 위치를 이미지 안에서도 그대로 유지해야 한다.

# ─── 1. 의존성 ─────────────────────────────────────────────
# package.json 만 먼저 복사한다. 소스만 바뀐 재빌드에서 npm ci 를 건너뛰기 위해서.
FROM node:22-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

# ─── 2. 빌드 ───────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
# shared/ 를 server/ 옆에 둔다. next.config.ts 가 리포 루트를 프로젝트 루트로 잡는다.
COPY shared/ /app/shared/
COPY server/ /app/server/
RUN npm run build

# ─── 3. 실행 ───────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# root 로 돌리지 않는다.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone 산출물은 추적 루트(리포 루트) 기준이라 server/ 하위에 들어 있다.
COPY --from=builder --chown=nextjs:nodejs /app/server/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/server/.next/static ./server/.next/static

# SQLite 파일이 놓일 자리. compose 가 ./data 를 여기 마운트한다.
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server/server.js"]
