# AI · AX 교육 플랫폼

일반계 고등학생 대상 **4시간 생성형 AI 특강**용 통합 웹 플랫폼.
강사 동기화 슬라이드 + 핸즈온 실습(AI 대화·이미지 생성·A/B 비교 랩) + **Kahoot형 라이브 퀴즈** + 투표를, 로그인 없이 **강의실 코드 + 닉네임**으로 진행합니다.

- 설계 문서: [`docs/superpowers/specs/2026-06-10-ai-ax-education-platform-design.md`](docs/superpowers/specs/2026-06-10-ai-ax-education-platform-design.md)

## 구성

| 영역 | 스택 |
|---|---|
| 프론트엔드 | React + Vite + Tailwind (모바일 우선), Socket.IO 클라이언트 |
| 백엔드 | Node + Fastify + Socket.IO, AI 프록시 |
| DB | Supabase(Postgres) — `axedu_*` 테이블, RLS 활성(서버 service_role만 접근) |
| AI | MiniMax(대화·비교 랩), Stability(이미지) — **키는 서버에만** 보관 |

```
server/   Fastify + Socket.IO + AI 프록시 + 콘텐츠 덱(정답은 서버 전용)
client/   React SPA (강사/학생/프로젝터)
shared/   공용 타입
```

## 1. 환경변수 설정

루트에 `.env` 를 만들고 (`​.env.example` 복사) 값을 채웁니다.

```bash
cp .env.example .env
```

- `SUPABASE_URL` — 이미 채워져 있음 (shain1912's Project2)
- `SUPABASE_SERVICE_ROLE_KEY` — **Supabase 대시보드 > Project Settings > API > service_role** 키 복사 (비밀!)
- `MINIMAX_API_KEY` — MiniMax 콘솔에서 발급
- `STABILITY_API_KEY` — Stability 플랫폼에서 발급

> 키가 없어도 서버는 **데모 모드**로 동작합니다 (DB 기록 off, AI는 예시 응답/플레이스홀더 이미지). 실제 수업 전 키를 채워주세요.

## 2. 개발 실행

```bash
npm install
npm run dev
```

- 클라이언트: http://localhost:5173 (Vite, API·소켓은 8787로 자동 프록시)
- 서버: http://localhost:8787

## 3. 프로덕션 빌드 & 실행 (단일 서버)

```bash
npm run build      # 클라이언트 빌드 → client/dist
npm start          # 서버가 SPA + API + 소켓을 :8787 에서 모두 서빙
```

브라우저에서 `http://<서버주소>:8787` 접속.

## 4. Oracle Cloud 배포 메모

1. Compute 인스턴스(Ubuntu, ARM/AMD 무관)에 Node 20+ 설치.
2. 코드 업로드 → `npm install && npm run build`.
3. 방화벽: 인스턴스 보안목록 + OS `iptables`/`ufw` 에서 포트 개방.
   - 직접: 8787 개방 후 `npm start`
   - 권장: **nginx** 리버스 프록시(80/443) → 8787, WebSocket 업그레이드 헤더 전달.
4. 상시 구동: `pm2 start "npm start" --name axedu` (또는 systemd).

nginx 예시 (WebSocket 포함):
```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## 5. 수업 진행 흐름

1. **강사**: `/teach` → "새 강의실 만들기" → 강의실 **코드** 발급.
2. **학생**: `/join` 에서 코드 + 닉네임 입력 (또는 강사가 공유한 학생 링크).
3. **프로젝터**(선택): `/screen/<코드>` 를 교실 큰 화면에 띄움.
4. 강사가 슬라이드를 넘기면 학생 화면도 동기화. 활동(실습/퀴즈/투표)을 강사가 열고, 퀴즈는 "문제 시작 → 정답 공개 → 다음 문제"로 진행.

## 6. 안전 · 비용 제어 (미성년자)

- 서버측 **콘텐츠 안전 필터**(부적절 입력 차단) + 이미지 안전 스타일.
- **1인당 쿼터**: 활동별 대화/이미지 횟수 제한 (`.env`의 `QUOTA_*`).
- **강의실 예산 상한**(`CLASSROOM_BUDGET_USD`) 초과 시 자동 차단.
- 강사 **AI 일시정지/재개** 버튼.
- 개인정보 미수집(닉네임만), 강의실 데이터는 `expires_at` 후 만료.

## 7. DB 스키마

`axedu_classrooms · axedu_participants · axedu_quiz_responses · axedu_poll_responses · axedu_ai_usage · axedu_lab_runs`
모두 RLS 활성(정책 없음) → 클라이언트 직접 접근 차단, 서버 service_role만 접근.
