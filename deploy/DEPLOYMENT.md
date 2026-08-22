# 배포 정보 (KodeKorea VPS)

> ⚠️ 이 파일은 인프라 식별자를 담고 있습니다. 공개 저장소에 올리지 마세요.
> (구 Oracle Cloud 배포 정보는 폐기되었습니다 — 현재는 KodeKorea 자체 VPS에서 운영)

## 한눈에 보기

| 구분 | 프로덕션 | 스테이징 |
|---|---|---|
| 주소 | https://blend.kodekorea.kr | https://axedu-dev.kodekorea.kr |
| 컨테이너 | `axedu` (이미지 `axedu:local`) | `axedu-dev` (이미지 `axedu-dev:local`) |
| 호스트 포트 | `127.0.0.1:10003` → 8787 | `127.0.0.1:10005` → 8787 |
| 소스 | `~/render-apps/axedu-src` | `~/render-apps/axedu-dev-src` |
| env 파일 | `~/render-apps/env/axedu.env` | `~/render-apps/env/axedu-dev.env` |
| DB | `axedu` (**절대 직접 조작 금지**) | `axedu_dev` |
| PostgREST | `axedu-rest` | `axedu-rest-dev` |

- VPS: **156.228.4.156** (Ubuntu, KodeKorea 공용 앱 서버)
- 두 컨테이너 모두 `restart=unless-stopped`, bridge 네트워크, 컨테이너 내부 포트 8787.

## SSH 접속

```bash
# bash (Git Bash / WSL)
ssh -i /c/Users/seong/.ssh/id_ed25519 ubuntu@156.228.4.156
```
```powershell
# PowerShell
ssh -i $HOME\.ssh\id_ed25519 ubuntu@156.228.4.156
```

## 트래픽 구조 (Cloudflare → Caddy → 컨테이너)

```
브라우저 → Cloudflare (DNS + 프록시, TLS)
        → VPS의 Caddy (/etc/caddy/Caddyfile)
        → reverse_proxy 127.0.0.1:1000x → docker 컨테이너(내부 8787)
```

Caddyfile 해당 블록:

```caddy
blend.kodekorea.kr {
    reverse_proxy 127.0.0.1:10003
}

axedu-dev.kodekorea.kr {
    reverse_proxy 127.0.0.1:10005
}
```

- 새 서브도메인 추가 시: Cloudflare에 A 레코드(프록시 ON) 추가 → Caddyfile 블록 추가 → `sudo systemctl reload caddy`.
- 컨테이너 포트는 전부 `127.0.0.1`에만 바인딩 — 외부 직접 접근 불가, Caddy 경유만 허용.

## 재배포 절차 (스테이징 기준)

서버에서:

```bash
cd ~/render-apps/axedu-dev-src
git pull
docker build -t axedu-dev:local .
docker rm -f axedu-dev
docker run -d --name axedu-dev --restart unless-stopped \
  -p 127.0.0.1:10005:8787 \
  --env-file ~/render-apps/env/axedu-dev.env \
  axedu-dev:local
```

프로덕션은 이름/포트/경로만 치환: `axedu-src` · `axedu:local` · `axedu` · `10003` · `env/axedu.env`.

- **env 변경만** 필요할 때: `~/render-apps/env/axedu-dev.env` 편집 후 컨테이너 제거·재생성(위 `docker rm -f` + `docker run`). env 파일은 컨테이너 생성 시점에 주입되므로 `docker restart`만으로는 반영되지 않음.
- 로컬에서 코드를 고쳐도 스테이징에는 **자동 반영되지 않음** — 반드시 git push → 서버에서 위 절차 수행.

## dev DB DDL 적용법

REST 경유로는 DDL 불가(exec_sql RPC 없음, pg-meta 404) — psql로 직접 적용:

```bash
ssh -i /c/Users/seong/.ssh/id_ed25519 ubuntu@156.228.4.156 \
  "docker exec -i supabase-db psql -U postgres -d axedu_dev" < deploy/migrations/파일.sql
```

- 마이그레이션 SQL은 **additive-only**로 `deploy/migrations/`에 파일로 커밋하는 관례.
- 스키마 변경 후 PostgREST 캐시 미갱신으로 `PGRST204` 에러가 나면:
  `NOTIFY pgrst, 'reload schema';` 또는 `docker restart axedu-rest-dev` (dev 전용 — 프로덕션은 `axedu-rest`).
- **프로덕션 DB(`axedu`)는 절대 직접 접근/조작 금지** — 실서비스 수업 운영 중.

## 운영 명령 (서버에서)

```bash
docker ps --filter name=axedu            # 상태
docker logs -f axedu-dev                 # 로그 (프로덕션: axedu)
docker restart axedu-dev                 # 재시작 (env 변경 반영은 안 됨 — 위 참고)
sudo systemctl status caddy              # Caddy 상태
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```
