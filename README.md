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

처음 열면 서버 주소와 토큰을 물어본다. 브라우저에만 저장되고 빌드에는 들어가지 않는다.

## 배포

- **화면** — `main` 에 푸시하면 GitHub Actions 가 `client/` 를 빌드해 GitHub Pages 로 올린다
- **서버** — `docker compose up -d --build`. 어디든(오라클·VPS·라즈베리파이) 같은 명령이다

서버 주소가 정해지면 그 오리진을 `ALLOWED_ORIGINS` 에 넣어야 화면이 데이터를 받을 수 있다.

## 스택

`client` Vite · React 19 · Tailwind v4 → 정적 번들
`server` Next.js 16 (API 전용) · Docker

설계 전제와 **보안 규칙**은 [CLAUDE.md](./CLAUDE.md) 에 있다.
