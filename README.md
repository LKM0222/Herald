# Herald 🐓

> 매일 아침, 하루를 여는 전령.

정해진 시각에 뉴스·일정·어제 하던 일을 모아 **브리핑**을 만들고, 디스코드로 알림을 보낸다.
알림을 누르면 웹페이지가 열리고, PC에서는 거기서 바로 **앱과 Claude 세션을 발사**한다.

```
  ⏰ 08:30 ─ 수집 ─ 요약 ─┬─ 🌐 웹 브리핑  ← 폰·PC 어디서든
                          └─ 📨 디스코드 알림 ─ 탭 ─ 위 페이지로
```

개인용 자체 호스팅 서비스다. 나중에 친구를 **같은 공간에** 초대할 수 있다
(서로의 일정을 공유하는 게 아니라, 하나의 서비스를 같이 쓰는 방식).

## 상태

🚧 초기 구축 중. 지금은 프로젝트 골격만 있다.

- [x] 프로젝트 초기화 · Next.js/Docker 골격
- [ ] 디스코드 OAuth 로그인
- [ ] 브리핑 페이지 (PC · 모바일)
- [ ] 디스코드 웹훅 알림
- [ ] RSS 수집 + Claude 요약
- [ ] 네이버 캘린더 (CalDAV)
- [ ] `herald://` 로컬 액션 핸들러

## 실행

```bash
cp .env.example .env      # 값을 채운다
docker compose up
```

→ http://localhost:3000

개발 중에는 `web/` 에서 직접 돌려도 된다.

```bash
cd web && npm install && npm run dev
```

## 스택

Next.js (App Router) · SQLite + Drizzle · Docker

자세한 설계 전제와 **보안 규칙**은 [CLAUDE.md](./CLAUDE.md) 에 있다.
