# Herald — 배포 단위는 이 컨테이너 하나다.
# 빌드 컨텍스트는 리포 루트(web/ 위)라, 나중에 shared/ 가 생겨도 같이 복사할 수 있다.

# ─── 1. 의존성 ─────────────────────────────────────────────
# package.json 만 먼저 복사한다. 소스만 바뀐 재빌드에서 npm ci 를 건너뛰기 위해서.
FROM node:22-alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ─── 2. 빌드 ───────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
RUN npm run build

# ─── 3. 실행 ───────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# root 로 돌리지 않는다.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone 산출물에는 실행에 필요한 node_modules 만 들어 있다.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# SQLite 파일이 놓일 자리. compose 가 ./data 를 여기 마운트한다.
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
