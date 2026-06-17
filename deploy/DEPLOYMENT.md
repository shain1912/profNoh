# 배포 정보 (Oracle Cloud)

> ⚠️ 이 파일은 인프라 식별자를 담고 있습니다. 공개 저장소에 올리지 마세요.

## 라이브 주소
- **앱**: http://168.107.44.248/
- 학생 입장: http://168.107.44.248/join
- 강사 콘솔: http://168.107.44.248/teach
- 프로젝터: http://168.107.44.248/screen/&lt;코드&gt;

## 인프라
- 리전: `ap-chuncheon-1` (춘천), AD: `CTOi:AP-CHUNCHEON-1-AD-1`
- 인스턴스: `axedu-vm` — VM.Standard.E2.1.Micro (AMD 1 OCPU/1GB, Always Free) + 스왑 2GB
  - (A1.Flex ARM은 "Out of host capacity"로 불가 → 추후 용량 확보 시 이전 가능)
- OS: Ubuntu 22.04 (x86)
- 공인 IP: **168.107.44.248**
- 네트워킹: VCN `axedu-vcn` (10.0.0.0/16), 퍼블릭 서브넷 `axedu-subnet` (10.0.1.0/24)
- 보안목록 인그레스: 22, 80, 443, 8787 / OS iptables 동일 허용
- 런타임: nginx(80) → 리버스 프록시 → node(8787), pm2 `axedu` (부팅 자동시작 systemd 등록)

상세 OCID는 `deploy/.oci-state.json` 참고.

## SSH 접속
```powershell
ssh -i $HOME\.ssh\oci_axedu ubuntu@168.107.44.248
```

## 🔑 AI/DB 상태: **라이브** (키 적용 완료)
- **MiniMax**: 키 4개 라운드로빈 로테이션 (교실 레이트리밋 분산). 채팅·비교 랩 동작.
- **Stability**: 이미지 생성 동작. 한글 프롬프트는 **자동으로 영어로 번역 후** 호출 → 품질↑ + 모더레이션 오탐↓.
- **Supabase DB**: publishable(anon) 키 + `axedu_*` RLS 정책으로 기록 동작 (강의실/참가자/퀴즈/투표/사용량/랩).

검증 완료(e2e): CHAT 200 · LAB 200(맥락 A/B 차이) · IMAGE 200(실제 4.8MB) · DB 저장 확인.

키 변경/추가가 필요하면 `/opt/axedu/.env` 편집 후 `pm2 restart axedu`:
```bash
ssh -i $HOME\.ssh\oci_axedu ubuntu@168.107.44.248
nano /opt/axedu/.env     # MINIMAX_API_KEY1..N, STABILITY_API_KEY1.., SUPABASE_SERVICE_ROLE_KEY
pm2 restart axedu
```
- MiniMax 키 추가: `MINIMAX_API_KEY5=...` 처럼 번호를 늘리면 자동 로테이션에 포함됨.
- 더 강한 DB 보안을 원하면 service_role 키로 바꾸고 `axedu_anon_all` 정책을 제거하세요.

## 코드 업데이트 재배포
로컬에서 빌드 후 업로드:
```powershell
npm run build
tar -czf $env:TEMP\axedu.tar.gz --exclude=node_modules --exclude=.git --exclude=./deploy/.oci-state.json -C H:\profNoh .
scp -i $HOME\.ssh\oci_axedu $env:TEMP\axedu.tar.gz ubuntu@168.107.44.248:/tmp/
ssh -i $HOME\.ssh\oci_axedu ubuntu@168.107.44.248 "cd /opt/axedu && tar -xzf /tmp/axedu.tar.gz -C /opt/axedu && npm install --no-fund --no-audit && pm2 restart axedu"
```

## 운영 명령 (서버에서)
- 상태: `pm2 status` / 로그: `pm2 logs axedu`
- 재시작: `pm2 restart axedu` / 중지: `pm2 stop axedu`
- nginx: `sudo systemctl status nginx` / `sudo nginx -t && sudo systemctl reload nginx`

## HTTPS(선택, 도메인 있을 때)
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```
