# 스테이징 사용 가이드 (axedu-dev.kodekorea.kr)

스테이징은 프로덕션(blend.kodekorea.kr)과 같은 VPS에서 도는 별도 컨테이너(`axedu-dev`)로,
DB도 별도(`axedu_dev`)를 사용합니다. 인프라 상세와 재배포 절차는 [deploy/DEPLOYMENT.md](../deploy/DEPLOYMENT.md) 참고.

## 로그인 (dev 로그인)

스테이징은 `DEV_LOGIN=1`이라 OAuth 콘솔 등록 없이 이메일만으로 로그인할 수 있습니다.

- **UI**: 로그인 화면(AuthGate)에 dev 로그인 이메일 입력란이 표시됨 — 이메일 입력 후 Enter.
- **API**: `POST /api/auth/dev-login` body `{ "email": "you@example.com", "name": "이름(선택)" }`
  → 세션 쿠키 발급. 처음 보는 이메일은 자동으로 사용자 생성(provider `dev`).
- `DEV_LOGIN`은 스테이징/로컬 전용 — **프로덕션에서는 반드시 0**.

## 관리자(/admin) 접근

- `ADMIN_EMAILS`(콤마 구분 목록)에 있는 이메일로 로그인하면 자동으로 `super_admin` 승격.
- 스테이징 현재 값: `ADMIN_EMAILS=shain1912@gmail.com` — 이 이메일로 dev 로그인하면
  https://axedu-dev.kodekorea.kr/admin 접근 가능.
- 다른 관리자를 추가하려면 `~/render-apps/env/axedu-dev.env`의 `ADMIN_EMAILS`에 이메일을 추가하고
  컨테이너를 재생성(DEPLOYMENT.md의 재배포 절차 중 `docker rm -f` + `docker run` 단계).

## 결제: BILLING_PROVIDER 전환 (mock ↔ toss)

- `mock`: 토스 실키 없이 승인 플로우를 시뮬레이션 — E2E 테스트용. 결제창 없이 바로 승인 처리.
- `toss`: 토스페이먼츠 위젯 사용 — `TOSS_CLIENT_KEY`(test_ck_/live_ck_), `TOSS_SECRET_KEY`(test_sk_/live_sk_) 필요.

전환 방법 (서버에서):

```bash
# ~/render-apps/env/axedu-dev.env 에서 BILLING_PROVIDER=mock ↔ toss 수정 후
docker rm -f axedu-dev && docker run -d --name axedu-dev --restart unless-stopped \
  -p 127.0.0.1:10005:8787 --env-file ~/render-apps/env/axedu-dev.env axedu-dev:local
```

env는 컨테이너 생성 시점에 주입되므로 `docker restart`만으로는 반영되지 않습니다.
시크릿 키는 서버 전용 — 절대 클라이언트/저장소에 노출 금지.

## 구글 로그인 활성화 — 남은 콘솔 작업

코드는 준비돼 있고, 외부 콘솔 설정만 남았습니다.

### 구글

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → 기존 OAuth 클라이언트 열기.
2. **승인된 리디렉션 URI**에 추가: `https://axedu-dev.kodekorea.kr/api/auth/google/callback`
3. `axedu-dev.env`의 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 확인 후 컨테이너 재생성.

### 카카오 (미지원)

카카오 로그인은 사업자 요건 문제로 제품에서 제거되었습니다 (2026-08).
관련 라우트(`/api/auth/kakao/*`)와 `KAKAO_*` 환경변수는 더 이상 존재하지 않습니다.

## dev DB 직접 접근

```bash
ssh -i /c/Users/seong/.ssh/id_ed25519 ubuntu@156.228.4.156 \
  'docker exec -i supabase-db psql -U postgres -d axedu_dev'
```

- DDL 적용법·PGRST204 대처는 DEPLOYMENT.md 참고.
- **프로덕션 DB(`axedu`)는 절대 접근 금지.**
