# Herald 🐓

> 매일 아침, 하루를 여는 전령.

정해진 시각에 뉴스·일정·어제 하던 일을 모아 **브리핑**을 만들고, 디스코드로 알림을 보낸다.
알림을 누르면 웹페이지가 열리고, PC에서는 거기서 바로 **앱과 Claude 세션을 발사**한다.

```
  ⏰ 08:30 ─ 수집 ─ 요약 ─┬─ 📨 디스코드 알림 ─ 탭 ─┐
                          │                        ↓
                          └──────── JSON API ──→ 🌐 브리핑 화면
                             (server/)              (client/)
                          자체 호스팅              GitHub Pages
```

**화면과 데이터가 갈라져 있다.** 화면은 정적 번들이라 어디든 올릴 수 있고(Pages, 나중엔 크롬 새 탭),
서버는 JSON만 준다. 수집·요약·시크릿은 브라우저가 꺼져 있어도 돌아야 하므로 서버에 남는다.

개인용 자체 호스팅 서비스다. 나중에 친구를 **같은 공간에** 초대할 수 있다
(서로의 일정을 공유하는 게 아니라, 하나의 서비스를 같이 쓰는 방식).

## 상태

🚧 초기 구축 중.

- [x] 프로젝트 초기화 · Docker 골격
- [x] 정적 클라이언트 + JSON API 분리
- [x] 토큰 인증 · CORS
- [x] 브리핑 화면 (PC · 모바일, 더미 데이터)
- [x] 테마 (라이트 · 다크 · 시스템)
- [ ] RSS 수집 + Claude 요약
- [ ] 디스코드 웹훅 알림 · cron
- [ ] 네이버 캘린더 (CalDAV)
- [ ] 크롬 새 탭 확장
- [ ] `herald://` 로컬 액션 핸들러

## 실행

**서버 (API)**

```bash
cp server/.env.example server/.env   # API_TOKEN, ALLOWED_ORIGINS 를 채운다
docker compose up
```

설정 파일은 `server/.env` **한 군데**다. `npm run dev` 와 `docker compose` 가 같은 파일을 읽는다.

→ `http://localhost:3100/api/health`

개발 중엔 `cd server && npm run dev` 로 바로 띄워도 된다.

**화면**

```bash
cd client
npm install
npm run dev
```

→ http://localhost:5173

처음 열면 **토큰**을 물어본다. 서버 주소는 기본값이 채워져 있다.
주소는 DNS · 인증서 투명성 로그로 어차피 공개되는 값이라 번들에 박아도 되지만,
**토큰은 절대 빌드에 들어가지 않는다** — 브라우저에만 저장된다.

테마는 라이트 · 다크 · **시스템**(기본값) 셋이고 헤더에서 바꾼다.

## 배포

- **화면** — `main` 에 푸시하면 GitHub Actions 가 `client/` 를 빌드해 GitHub Pages 로 올린다
  → https://lkm0222.github.io/Herald/
- **서버** — 오라클 무료 티어 (Ubuntu 24.04 · x86 1 OCPU / 1GB)
  → https://lkm0222.duckdns.org

```bash
cp deploy/.env.example .env        # HERALD_DOMAIN 을 채운다
vi server/.env                     # API_TOKEN · ALLOWED_ORIGINS
docker compose -f docker-compose.prod.yml up -d --build
```

로컬용 `docker-compose.yml` 과 갈라져 있다. **서버는 앱 포트를 인터넷에 열지 않는다** —
Caddy 만 80·443 을 내보내고 인증서를 자동 발급·갱신한다.

배포처에서는 방화벽 **두 겹**을 열어야 한다. 하나만 열면 원인이 안 보이는 채로 막힌다:

1. 클라우드 방화벽 — 오라클은 VCN → **Security Lists** → Ingress (80·443/TCP).
   Route Rules 가 아니다
2. 서버 안 `iptables` — Ubuntu 이미지엔 22 외 전부 막는 REJECT 규칙이 들어 있다

`ALLOWED_ORIGINS` 에 화면의 오리진(`https://lkm0222.github.io`)이 없으면
서버가 200 을 줘도 브라우저가 응답을 버린다.

## 스택

`client` Vite · React 19 · Tailwind v4 → 정적 번들
`server` Next.js 16 (API 전용) · Docker

설계 전제와 **보안 규칙**은 [CLAUDE.md](./CLAUDE.md) 에 있다.
