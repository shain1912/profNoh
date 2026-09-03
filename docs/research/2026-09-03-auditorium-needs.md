# 대규모 강당·직장인 청중 시나리오 요구 조사

- 작성일: 2026-09-03
- 목적: axedu(코드 입장 실시간 수업 플랫폼)를 **수백 명 강당에서 일반인·직장인 대상 강연**에 특화시키기 위한 기능 로드맵 근거 자료
- 범위: 300~1,000석 강당, 강연자 1명(+보조 진행자 0~1명), 청중은 개인 스마트폰만 소지, 사전 안내 없이 현장 참여
- 방법: 강연자·사내교육 담당자 베스트 프랙티스, 상용 도구(Slido·Mentimeter·Poll Everywhere·Kahoot) 공식 문서, 주의집중·교육평가 연구를 검색해 8개 축으로 정리하고 axedu 현재 코드와 대조

---

## 0. 핵심 발견 요약

| # | 발견 | 로드맵 함의 |
|---|---|---|
| 1 | 직장인 청중은 **익명이 기본값**이어야 참여한다. 익명일 때 피드백 의향이 74%로 올라간다는 조사가 있고, Slido는 "익명 기본/실명 기본/항상 익명/항상 실명" 4단계 토글을 모든 요금제에 제공 | 세션 단위 익명 정책 토글 + 자동 생성 닉네임 |
| 2 | 입장 마찰은 **QR + 짧은 코드 + 링크 3중 표시**가 표준이고, QR은 시청 거리의 1/10 크기(10:1 규칙) 이상이어야 뒷줄에서 찍힌다 | 프로젝터 뷰에 상시 입장 바(QR·코드·URL) 추가 |
| 3 | 수백 명이 **같은 15분 안에 동시 접속**하면 행사장 Wi-Fi는 AP당 50~75대부터 성능이 꺾인다. 도구 쪽 대책은 지터 재접속·서버 접속 속도제한·결과 집계 스로틀 | 소켓 재접속 지터, 결과 브로드캐스트 배치, 저대역폭 모드 |
| 4 | 주의는 첫 30초부터 끊기고 이후 **약 4.5분 주기**로 짧게 반복 이탈하지만, 클리커 질문·시연 직후 구간은 이탈이 유의하게 준다. 즉 "10~15분마다 1개 활동"이 근거 있는 리듬 | 90분 타임라인에 6~7개 참여 포인트를 표준 템플릿으로 제공 |
| 5 | 만족도 설문은 **세션 종료 직전 5분에 현장 응답**이 응답률에서 이메일 후속 발송보다 압도적으로 낫고, 문항은 5~10개·2~3분·"현업 관련성"이 가장 예측력 있는 문항 | 종료 5분 전 자동 설문 + 주최측 PDF 리포트 |

---

## 1. 강당 시나리오가 교실 시나리오와 다른 점

| 차원 | 교실(현재 axedu 가정) | 강당·직장인 강연 |
|---|---|---|
| 규모 | 20~40명 | 200~1,000명 |
| 관계 | 교사↔학생, 반복 만남 | 강연자↔초면 청중, 1회성 |
| 참여 동기 | 성적·교사 지시 | 자발적, 심리적 안전이 없으면 침묵 |
| 기기 | 학교 태블릿/PC 혼재 | 개인 스마트폰 100% |
| 네트워크 | 학교 Wi-Fi, 순차 접속 | 행사장 Wi-Fi 포화, LTE/5G 혼재, 동시 접속 |
| 화면 | 근거리 TV/빔 | 15~30m 대형 스크린, 뒷줄 판독성 |
| 진행 인력 | 교사 1인이 모두 조작 | 강연자는 무대, 조작은 보조 진행자가 맡는 경우 많음 |
| 사후 | 학습 리포트 | 주최측(HRD·총무) 제출용 참여 통계·만족도 |

---

## 2. 축별 요구사항

각 축은 "왜 강당에서 중요한가 → 근거 → 요구사항(동작 디테일)" 순서다. 요구사항 ID는 `A1-1` 형식(축-번호). 우선순위: **P0** 강당 강연 성립에 필수, **P1** 품질 차이, **P2** 차별화.

### 축 1. 진입 마찰 — 초대형 QR, 로그인 없음, 닉네임 익명

**왜 중요한가.** 강당에서는 첫 1~2분 안에 수백 명이 동시에 들어와야 하고, 한 사람이라도 막히면 옆 사람에게 물어보느라 장내가 술렁인다. 강연자는 무대에서 개별 트러블슈팅을 할 수 없다. 이벤트 앱 조사에서 이벤트 담당자의 42%가 "참가자가 앱을 안 깐다"를 겪었고, 앱 설치 방식 참여율은 홍보 없이는 20~30%에 머문다. 브라우저 링크 방식이 "다운로드 마찰 0"으로 참여율을 끌어올린다는 것이 업계 공통 결론이다.

**근거.**
- Mentimeter: 참가자는 계정 없이 코드·QR·링크 중 하나로 입장. 현장 행사에서는 "QR과 코드를 **함께** 띄워라, 사람마다 선호가 다르다"고 명시. 숫자 코드는 임시(48시간 유휴 시 갱신)이고 QR은 영구. ([Mentimeter Help — Get ready for in-person](https://help.mentimeter.com/en/articles/1382424-get-ready-for-your-in-person-menti), [Share QR code](https://help.mentimeter.com/en/articles/422271-share-qr-code), [How long is my join code valid](https://help.mentimeter.com/en/articles/2780681-how-long-is-my-join-code-valid))
- Slido: Present 모드에서 **모든 슬라이드에 입장 안내(slido.com + #코드)가 상시 표시**. ([Slido Community — Is there a limit](https://community.slido.com/community-questions-7/is-there-a-limit-to-the-audience-participation-3252))
- QR 크기 10:1 규칙: 스캔 거리의 1/10 폭. 1m → 10cm, 3m → 30cm, 10m → 1m. 화면 표시 최소 150×150px. ([Uniqode](https://www.uniqode.com/blog/qr-code-best-practices/how-to-perfectly-size-your-qr-codes), [Scanova](https://scanova.io/blog/qr-code-scanning-distance/), [QRLynx](https://qrlynx.com/blog/qr-code-size-guide-print))
- Kahoot 대형 행사 가이드: 부적절 닉네임 노출 방지를 위해 **닉네임 자동 생성기** 권장, 봇 차단용 2단계 입장(PIN + 패턴 버튼). ([Kahoot — Guide for one-time events](https://support.kahoot.com/hc/en-us/articles/11166126591891-Guide-for-one-time-events))
- 이벤트 앱 채택률: 담당자 42%가 미설치 문제, 홍보 없으면 20~30%, 평균 63%. ([Endless Events](https://helloendless.com/event-app-platform-adoption/), [Nunify 벤치마크](https://www.nunify.com/blogs/event-app-adoption-rate-benchmarks))
- 국내 사례: 명찰에 Q&A 접속 QR을 인쇄해 기조강연·패널토의에서 활용. ([이벤터스 블로그](https://event-us.kr/hostcenter/blog/368/nametag_qrcode))

**요구사항.**

| ID | 요구 | 동작 디테일(UX) | 우선순위 |
|---|---|---|---|
| A1-1 | 프로젝터 뷰 **상시 입장 바** | 모든 화면 상단(또는 좌하단) 고정 영역에 QR + 4~6자 코드 + 짧은 URL을 항상 표시. 대기 화면에서는 QR을 화면 높이의 40% 이상으로 확대(10:1 규칙 기준 20m 뒷줄 대응 시 화면 폭 2m 기준 QR 폭 최소 1m 이상이 이상적, 현실적으로는 앞·중간 줄 대응 + 코드 입력 병행) | P0 |
| A1-2 | **QR 딥링크 = 코드 자동 입력** | QR에 코드가 포함된 URL(`/join?c=ABCD`)을 넣어 스캔 시 코드 입력 화면을 건너뛰고 닉네임 단계로 직행. 코드 수동 입력 경로도 유지(사람마다 선호 다름) | P0 |
| A1-3 | **닉네임 자동 생성 + 1탭 입장** | 닉네임 필드를 비워 두지 않고 "차분한 수달 42"처럼 형용사+동물+숫자를 미리 채움. 사용자는 그대로 [입장] 한 번만 누르면 됨. 원하면 수정 가능, 세션 설정으로 "자동 생성만 허용"(부적절 닉네임 차단) 선택 | P0 |
| A1-4 | 로그인·계정·앱 설치 **0** | 청중 경로는 순수 웹. 세션 토큰은 localStorage에 저장해 새로고침·재접속 시 동일 참가자로 복구(중복 카운트 방지) | P0 |
| A1-5 | 성인용 카피 톤 | 현재 Join 화면 문구("선생님이 알려준 코드", "확인해줘!")를 세션 유형(교실/강연)에 따라 존댓말·중립 톤으로 전환 | P1 |
| A1-6 | 입장 실패 자가 복구 안내 | 코드 오류 시 "화면의 코드를 다시 확인" + 대체 경로(URL 직접 입력) 제시. 네트워크 실패 시 자동 재시도 3회 후 "Wi-Fi 대신 모바일 데이터로 시도" 안내 | P1 |
| A1-7 | 늦은 입장자 처리 | 강연 중 입장한 사람도 현재 진행 중 활동에 바로 참여. 진행 중 퀴즈는 다음 문항부터 점수 반영 | P1 |
| A1-8 | 2단계 입장(봇 차단) 옵션 | 공개 행사에서 코드가 SNS로 새는 경우 대비. 화면에 표시된 4개 도형 중 지정 순서 탭 | P2 |

### 축 2. 익명성·심리적 안전 — 직장인은 실명 답변을 피한다

**왜 중요한가.** 사내 강연에는 상사·인사팀이 같은 공간에 있다. 실명이 스크린에 뜨는 순간 직장인은 "정답이 아닐까 봐", "부정적으로 보일까 봐" 응답을 멈춘다. 참여율은 곧 강연 성과이므로, 익명은 옵션이 아니라 기본값이어야 한다. 반대로 퀴즈 리더보드처럼 이름이 있어야 재미있는 활동도 있으므로 **활동 단위 익명 정책**이 필요하다.

**근거.**
- Slido: 익명일 때 피드백 의향 74%. "대부분 직원에게 모두 앞에서 질문하는 것은 위협적"이며 익명은 보복·창피·조롱 두려움을 없앤다. 산토리는 익명 Q&A로 "조용한 직원의 아이디어"를 얻었다. ([Slido — 4 Reasons to Run an Anonymous Q&A](https://blog.slido.com/anonymous-questions-q-and-a/), [Slido — Psychological safety](https://blog.slido.com/psychological-safety/))
- Slido 참가자 프라이버시 4모드: 익명 기본(기본값) / 실명 기본 / 항상 실명 요구 / 항상 익명. 무료 플랜 포함 전 요금제 제공, 조직 단위 일괄 설정 가능. ([Slido Community — Participant Privacy](https://community.slido.com/security-privacy-essentials-224/participant-privacy-choose-anonymous-or-named-participation-1609))
- Slido: 주최자는 이름을 추적하되 다른 참가자에게는 익명으로 보이게 설정 가능. ([Slido Community — track by name while anonymous to others](https://community.slido.com/community-q-a-7/how-do-i-track-participants-by-name-while-they-still-remain-anonymous-to-other-participants-3617))
- Mentimeter: 결과 즉시 노출 시 "정답보다 다수 선택지에 편승"하는 밴드왜건 효과. 결과 숨김 후 수동 공개(H 키). ([Mentimeter Help — Hide or show results](https://help.mentimeter.com/en/articles/422266-hide-or-show-results), [UTS Best practice](https://educationexpress.uts.edu.au/collections/engaging-your-audience-with-mentimeter-polls/resources/best-practice-in-mentimeter/))
- Poll Everywhere: 결과 공유 전 "응답이 익명임을 먼저 확인시켜라". ([Poll Everywhere — Best audience response tools](https://www.polleverywhere.com/use-cases/best-audience-response-tools-2026))
- 국내: 위메프·대한항공 등이 협업툴 익명게시판으로 심리적 안전 확보. 익명 채널이 "회사 정책에 솔직한 의견을 낼 유일한 수단"이 되기도. ([잡코리아 — 사내 익명게시판](https://www.jobkorea.co.kr/Corp/Lounge/News_View?GI_Trend_News_No=693))

**요구사항.**

| ID | 요구 | 동작 디테일(UX) | 우선순위 |
|---|---|---|---|
| A2-1 | **세션 익명 정책 4모드** | 세션 설정: `익명 기본` / `닉네임 기본` / `항상 익명` / `항상 닉네임`. 강연 템플릿 기본값은 `익명 기본` | P0 |
| A2-2 | **활동 단위 오버라이드** | 퀴즈(리더보드)는 닉네임, 의견 투표·자유응답·Q&A는 익명으로 활동마다 지정. 학생 화면 상단에 현재 활동의 표시 상태 뱃지("🔒 익명으로 제출됩니다")를 항상 노출 | P0 |
| A2-3 | 스크린에 **이름 없는 집계만** | 익명 활동의 프로젝터 뷰는 막대·워드클라우드·카드 목록에 닉네임을 절대 렌더링하지 않음. 자유응답 카드는 "익명" 라벨조차 생략(반복 노출 시 소음) | P0 |
| A2-4 | 결과 숨김→공개 제어 | 투표·퀴즈 기본값 "응답 마감 후 공개". 강연자 컨트롤에 [결과 공개] 토글. 응답 중 화면은 응답 수 카운터만 상승 | P0 |
| A2-5 | 제출 전 익명 안내 1회 | 첫 익명 활동 제출 직전 1회 툴팁 "닉네임은 강연자 화면에도 표시되지 않습니다". 이후 생략 | P1 |
| A2-6 | 주최자 추적 vs 청중 익명 분리 | 조직 요구(참석 확인)가 있을 때 서버에는 참가자 ID를 남기되 화면·리포트 기본 내보내기에서는 제외. 리포트 "식별 정보 포함" 내보내기는 세션 소유자만 | P1 |
| A2-7 | Q&A 익명 + 업보트 | 질문 카드에 작성자 없음, 👍 수만 표시. 작성자 본인 화면에서만 "내 질문" 강조 | P1 |
| A2-8 | 자기 응답 삭제 | 제출 후 60초 내 본인 응답 회수 가능(실수 방지, 심리적 안전 강화) | P2 |

### 축 3. 네트워크 스파이크 — 수백 명 동시 입장·제출

**왜 중요한가.** 강당은 "입장 첫 2분"과 "투표 오픈 직후 10초"에 트래픽이 집중된다. 행사장 Wi-Fi는 평상시 평균 부하 기준으로 설계돼 있어 전원이 같은 15분 안에 접속하는 피크를 견디지 못한다. 한 번 실패한 청중은 다시 시도하지 않으므로, 첫 활동의 성공률이 세션 전체 참여율을 결정한다.

**근거.**
- 행사장 Wi-Fi: 5GHz 라디오 1개당 활성 단말 50~75대부터 성능 저하, 에어타임 포화 시 급락. 대책은 사전 사이트 서베이·다중 ISP·셀룰러 폴백. 다만 단일 통신사 핫스팟은 그 기지국이 포화되면 같은 문제. ([Purple — WiFi for events](https://www.purple.ai/en-gb/guides/wifi-for-events-how-to-deliver-reliable-connectivity-for-large-crowds), [MR·NET](https://mrnet.us/blog/live-event-internet-production), [IMPLI-CIT](https://www.impli-cit.com/blog/why-do-event-venues-need-wifi-site-surveys-before-large-gatherings/))
- Kahoot 대역폭 표: 100명/5 Mbit, 200명/10 Mbit, 500명/23 Mbit, 1,000명/45 Mbit. 표준 2,000명, Large 모드 5,000명. ([Kahoot — How many participants](https://support.kahoot.com/hc/en-us/articles/115003072287-How-many-participants-can-play-a-kahoot), [joeybabcock — Large scale Kahoot](https://joeybabcock.me/blog/tutorial/setting-up-a-large-scale-kahoot-2/))
- Slido 플랜별 참가자 한도: Basic 100, 유료 200~5,000, 엔터프라이즈 최대 20,000. Poll Everywhere 5,000+. ([Slido Community — participant limit](https://community.slido.com/community-questions-7/is-there-a-limit-to-the-audience-participation-3252), [Poll Everywhere — Audience size limits](https://support.polleverywhere.com/hc/en-us/articles/44235308703131-Audience-Size-Limits-in-Poll-Everywhere-2-0))
- 썬더링 허드: 서버 재시작·네트워크 블립 시 전원 동시 재접속 → TLS·WebSocket 업그레이드 폭주. 대책은 **클라이언트 지터 재접속 + 서버 접속 속도제한**, 토큰 버킷, 스트림 버퍼링. ([WebSocket.org — Connection limits](https://websocket.org/guides/connection-limits/), [Encore — Thundering herd](https://encore.dev/blog/thundering-herd-problem), [Redis — Tame the thundering herd](https://redis.io/blog/how-to-tame-the-thundering-herd-problem/), [Evil Martians — AnyCable k6](https://evilmartians.com/chronicles/real-time-stress-anycable-k6-websockets-and-yabeda))
- Poll Everywhere: SMS 응답은 2.0에서 미지원. "Wi-Fi·셀룰러가 충분히 안정적"이라는 판단. 국내는 문자 응답 인프라가 없으므로 SMS 폴백은 비현실적. ([Poll Everywhere — SMS](https://support.polleverywhere.com/hc/en-us/articles/1260801546910-SMS-Text-messaging))

**요구사항.**

| ID | 요구 | 동작 디테일(UX/기술) | 우선순위 |
|---|---|---|---|
| A3-1 | **1,000명 동시 입장 부하 테스트** | k6 등으로 "30초 내 1,000 접속 + 10초 내 1,000 제출" 시나리오를 CI에 고정. 목표: 제출 p95 < 2초, 프로젝터 집계 반영 < 3초 | P0 |
| A3-2 | 소켓 재접속 **지터 + 지수 백오프** | 클라이언트 재접속 간격 1s→2s→4s… 에 ±30% 랜덤. 서버는 IP·세션당 접속 속도제한(토큰 버킷) | P0 |
| A3-3 | 결과 브로드캐스트 **배치·스로틀** | 제출마다 전원에게 푸시하지 않고 프로젝터에는 200~500ms 간격 집계 스냅샷, 청중 화면에는 "내 제출 완료" ACK만. 청중은 결과를 프로젝터로 본다 | P0 |
| A3-4 | **저대역폭 청중 페이지** | 첫 로드 JS 번들 200KB 이하 목표, 이미지 없는 텍스트 버튼 UI, 폰트 시스템 폰트. LTE 1칸에서도 5초 내 입장 | P0 |
| A3-5 | 제출 **낙관적 UI + 오프라인 큐** | 탭 즉시 "제출됨" 표시, 실패 시 백그라운드 재시도(최대 3회, 활동 마감 전까지). 마감 후 도착한 응답은 서버가 폐기하고 사용자에게 "마감되어 반영되지 않았습니다" 표시 | P1 |
| A3-6 | 프로젝터 뷰 **접속 상태 게이지** | 상시 입장 바 옆에 "접속 412명" 카운터. 강연자가 "다 들어오셨나요"를 화면으로 확인 | P1 |
| A3-7 | 활동 오픈 **카운트다운 3초** | 투표 오픈 시 프로젝터에 3-2-1 카운트다운을 띄워 제출 시점을 분산(모두가 동시에 탭하는 스파이크 완화) | P1 |
| A3-8 | 사전 점검 체크리스트 | 세션 시작 전 "행사장 Wi-Fi SSID 안내 슬라이드 / 모바일 데이터 권장 문구 / 서버 헬스" 3항목 체크 UI | P2 |
| A3-9 | 강연자 측 회선 이중화 안내 | 강연자 PC는 유선 또는 별도 핫스팟 권장. 프로젝터 뷰는 소켓 끊겨도 마지막 상태 유지 + 자동 재접속 | P2 |

### 축 4. 대형 스크린 가독성

**왜 중요한가.** 강당 뒷줄은 스크린에서 15~30m 떨어져 있다. 교실용 폰트 크기로는 입장 코드도, 투표 선택지도 읽히지 않는다. 읽히지 않으면 참여하지 않는다.

**근거.**
- 8H 규칙: 최대 시청 거리 ≤ 화면 높이 × 8. 이 조건에서 텍스트 높이가 화면 높이의 1/50 이상이면 "판독 가능"(단, 편안한 크기가 아니라 최소치). ([Presentation Guild — 8H Rule](https://presentationguild.org/how-big-big-enough-the-8h-rule-reveals-all/))
- 대형 강당 권장: 제목 48~60pt, 본문 28pt 이상(1080p 슬라이드 기준). 18pt 미만은 프로젝터에서 판독 불가. ([presentations.ai](https://www.presentations.ai/blog/what-font-size-is-best-for-presentations), [beautiful.ai](https://www.beautiful.ai/blog/what-font-size-is-best-for-presentations))
- QR 10:1 규칙(축 1 참조).
- Poll Everywhere·Slido 모두 결과 화면은 슬라이드 안에 통합되어 강연자가 PPT를 벗어나지 않음. ([Slido features](https://www.slido.com/product), [Poll Everywhere — ARS](https://www.polleverywhere.com/audience-response-system))

**요구사항.**

| ID | 요구 | 동작 디테일(UX) | 우선순위 |
|---|---|---|---|
| A4-1 | **프로젝터 "강당 모드"** | 세션 설정에서 `교실 / 강당` 선택. 강당 모드는 모든 텍스트 스케일 ×1.5, 최소 본문 크기 화면 높이의 1/40(1080p 기준 27px 이상, 실제로는 36px+), 제목 1/15 이상 | P0 |
| A4-2 | 고대비·단색 배경 | 강당 조명(밝은 무대·어두운 객석 혼재)에 강한 다크 배경 + 흰 텍스트 + 채도 높은 선택지 색. 그라데이션·얇은 선 금지 | P0 |
| A4-3 | 선택지 **4개 이하 + 색·도형 코드** | 투표 선택지는 색상과 도형(▲ ◆ ● ■)을 함께 써서 색약자·원거리 판별. 청중 폰 화면도 같은 색·도형 | P0 |
| A4-4 | 워드클라우드 최소 글자 크기 보장 | 소수 응답 단어도 최소 24px, 상위 5개 단어는 80px+. 100단어 초과 시 하위 절삭 | P1 |
| A4-5 | 자유응답 카드 **큐레이션 뷰** | 수백 개 자유응답을 한 화면에 뿌리지 않고, 진행자가 고른 3~5개를 큰 카드로 순환 표시. 나머지는 스크롤 없이 "외 187개" 카운터 | P1 |
| A4-6 | 막대 그래프에 **비율 + 응답 수** 동시 표기 | "62% (318)" 형식. 뒷줄에서는 막대 길이만으로 판독되도록 막대 두께 화면 높이의 8% 이상 | P1 |
| A4-7 | 상시 입장 바 최소 크기 | 강당 모드에서 하단 바 높이 화면의 12%, 코드 글자 높이 화면의 6% 이상, QR 한 변 화면 높이의 10% 이상 | P1 |
| A4-8 | 슬라이드 도구 통합 | PPT/Keynote를 벗어나지 않게 프로젝터 뷰를 별도 창(듀얼 모니터)으로 띄우고 단축키로 PPT↔axedu 전환, 또는 PPT 안에 임베드하는 브라우저 위젯 | P2 |

### 축 5. 강연 리듬 — 오프닝 아이스브레이커, 중간 환기, 마무리 설문 타이밍

**왜 중요한가.** 90분은 성인 청중에게 길다. 주의는 연속 10~20분 유지되지 않고 짧은 주기로 끊기며, 강연 후반으로 갈수록 주기가 짧아진다. 참여 활동은 단순 재미가 아니라 **주의 리셋 장치**이고, 언제 넣느냐가 효과를 좌우한다.

**근거.**
- Bunce et al. 2010 (J. Chem. Educ.): 클리커 자기보고로 측정. 첫 이탈은 시작 30초 안에, 이후 약 4.5분 간격으로 짧은(1분 이하) 이탈 반복. 강연이 진행될수록 주기가 짧아짐. **시연·클리커 질문 직후 구간은 이탈이 유의하게 감소.** ([ERIC EJ921304](https://eric.ed.gov/?id=EJ921304), [Faculty Focus 요약](https://www.facultyfocus.com/articles/teaching-and-learning/students-attention-interesting-analysis/))
- Wilson & Korn 2007 "Attention during lectures: beyond ten minutes": "10분 규칙"의 실증 근거는 약하지만 변화(variety)가 주의를 회복시킨다는 점은 일관. ([ResearchGate](https://www.researchgate.net/publication/234649194_Attention_During_Lectures_Beyond_Ten_Minutes), [Adv Physiol Educ 2016](https://journals.physiology.org/doi/full/10.1152/advan.00109.2016))
- Duarte: 첫 1분 안에 첫 이탈 발생, 그 안에 잡지 못하면 폰으로 간다. ([Duarte — Engage your audience](https://www.duarte.com/blog/how-to-interact-with-audience-members-while-you-present/))
- Poll Everywhere 대형 강의 패턴: **시작**에 출석 겸 객관식, **중간**에 한 단어 워드클라우드, **끝**에 "무엇이 궁금한가". ([Poll Everywhere — Lecture method](https://www.polleverywhere.com/case-studies/lecture-method))
- Slido: 워밍업 폴은 "앱에 들어오게 하는" 장치. 워드클라우드 질문은 "한 단어로, …" 프레이밍으로 짧은 답 유도. 예: "한 단어로 지금 기분은?", "오늘 듣고 싶은 주제는?". Q&A는 업보트를 먼저 시키면 재활성화 효과. ([Slido — Word cloud examples](https://blog.slido.com/word-cloud-examples/), [Slido — Live polling guide](https://blog.slido.com/how-to-use-live-polling-in-a-presentation/), [Slido — Fix your Q&A](https://blog.slido.com/fix-your-qa-session/))
- Kirkpatrick L1 설문은 "반응이 가장 선명한" 세션 종료 시점, 마지막 5분을 비워 현장 응답. ([Formbricks — Training survey questions](https://formbricks.com/blog/training-survey-questions), [Sopact](https://www.sopact.com/use-case/training-feedback-survey))

**요구사항.**

| ID | 요구 | 동작 디테일(UX) | 우선순위 |
|---|---|---|---|
| A5-1 | **90분 강연 템플릿** | 새 세션 만들 때 "90분 강연" 템플릿 선택 시 §4 타임라인의 활동 7개가 슬롯으로 미리 생성됨(문구만 수정) | P0 |
| A5-2 | 워밍업 활동 = 입장 확인 겸용 | 첫 활동은 항상 위험 0 질문(한 단어 워드클라우드 또는 2지선다). 응답 수가 곧 입장 확인 | P0 |
| A5-3 | 활동 **타이머 + 자동 마감** | 활동마다 기본 60~90초 타이머, 프로젝터에 원형 게이지. 마감 시 자동으로 결과 공개(설정 가능) | P0 |
| A5-4 | Q&A 상시 수집 + **업보트 정렬** | 강연 내내 청중은 질문 제출 가능. Q&A 슬롯에서 강연자는 업보트 순 상위 5개를 큰 카드로 봄 | P1 |
| A5-5 | 리듬 알림 | 강연자 컨트롤 화면에 "마지막 활동 후 14분 경과" 배지. 15분 넘으면 노랑, 20분 넘으면 빨강 | P1 |
| A5-6 | 종료 5분 전 **설문 자동 큐** | 세션 예정 종료 시각 5분 전에 컨트롤 화면에 "만족도 설문 열기" 버튼이 크게 뜨고, 1탭으로 오픈. 설문은 5문항 이내 | P1 |
| A5-7 | 활동 결과를 다음 슬라이드 재료로 | 워드클라우드 상위 3단어, 투표 1위를 강연자 노트에 자동 표시해 "여러분 62%가 A를 고르셨는데…"로 이어가게 | P2 |

### 축 6. 발표자 부담 최소화 — 원버튼, 보조 진행자

**왜 중요한가.** 강연자는 무대에서 마이크·클리커·슬라이드를 동시에 다룬다. 활동 하나 여는 데 3번 이상 클릭이 필요하면 쓰지 않는다. 대형 행사는 보조 진행자(MC·HRD 담당자)가 도구를 대신 조작하는 경우가 많아 **역할 분리**가 필요하다.

**근거.**
- Mentimeter: 발표자 페이스(강연자가 넘겨야 다음 질문) vs 청중 페이스(설문처럼 자기 속도) 구분. 폰을 리모컨(Mentimote)으로 써서 무대 어디서든 슬라이드·결과 공개 제어. ([Mentimeter — Presenter vs Audience pace](https://www.mentimeter.com/blog/menti-news/live-presentation-or-survey-the-ultimate-guide-to-voting-pace), [Mentimote](https://help.mentimeter.com/en/articles/2233579-mentimote-our-presentation-remote))
- Slido 모더레이터 치트시트: 진행자는 질문 검토·승인, 강연자에게 상위 질문 전달, "계속 질문 보내달라" CTA 반복. 모더레이션 켜면 승인 전 질문은 호스트·공동호스트만 봄. ([Slido — Cheat sheet for moderators](https://blog.slido.com/slido-cheat-sheet-for-moderators/), [Slido Community — Moderation](https://community.sli.do/audience-q-a-42/use-moderation-and-manage-audience-questions-477), [Slido — All hands PDF](https://static.sli.do/documents/all-hands-and-town-halls-use-case.pdf))
- Kahoot 행사 가이드: 대형 행사에서는 호스트 외 보조가 로비·닉네임을 관리. ([Kahoot — Guide for one-time events](https://support.kahoot.com/hc/en-us/articles/11166126591891-Guide-for-one-time-events))

**요구사항.**

| ID | 요구 | 동작 디테일(UX) | 우선순위 |
|---|---|---|---|
| A6-1 | **원버튼 진행** | 컨트롤 화면 중앙에 큰 버튼 1개. 상태 머신: [다음 활동 열기] → [응답 마감] → [결과 공개] → [다음 활동 열기]. 스페이스바·클리커(PageDown)로도 동작 | P0 |
| A6-2 | **폰 리모컨 모드** | 강연자 폰으로 컨트롤 화면 접속 시 세로형 리모컨 UI(큰 버튼 + 현재 응답 수 + 남은 시간). PC 없이 폰만으로 진행 가능 | P0 |
| A6-3 | **보조 진행자 역할** | 세션당 공동 진행자 링크 발급. 권한: 활동 열기/마감, Q&A 승인·핀, 자유응답 큐레이션. 권한 없음: 세션 삭제, 리포트 식별 정보 | P0 |
| A6-4 | Q&A 모더레이션 | 세션 설정 `자동 공개 / 승인 후 공개`. 승인 큐는 보조 진행자 화면에만, 강연자 화면에는 승인된 상위 5개만 | P1 |
| A6-5 | 강연자 노트 뷰 | 강연자 컨트롤 화면에 현재 활동 + 다음 활동 미리보기 + 남은 시간만. 편집 UI는 완전히 숨김 | P1 |
| A6-6 | 활동 건너뛰기·되돌리기 | 시간이 밀리면 [건너뛰기] 1탭, 실수로 넘기면 [이전 활동 결과 다시 보기] | P1 |
| A6-7 | 리허설 모드 | 청중 없이 컨트롤·프로젝터·가짜 응답 200건으로 흐름을 5분 안에 점검 | P2 |
| A6-8 | 보조 진행자 ↔ 강연자 **귓속말** | 보조가 "다음 Q&A는 3번 질문부터" 같은 메모를 강연자 리모컨 화면에 띄움(청중 미노출) | P2 |

### 축 7. 사후 활용 — 참여 통계 리포트, 주최측 제출, 만족도 표준 문항

**왜 중요한가.** 사내 강연은 HRD·총무가 예산으로 부르고, 강연 후 "참여율·만족도"를 보고해야 다음 강연이 있다. 강연자 입장에서도 리포트는 재계약 영업 자료다. 리포트가 자동으로 나오지 않으면 강연 다음 날 엑셀 작업이 되고, 그러면 도구를 안 쓴다.

**근거.**
- Slido Analytics: 참여율, 질문 수, 투표 결과, Q&A 감성을 사후 리포트로 제공. PDF·Excel·Google Sheets 내보내기, 공유용 커스텀 리포트. 조직 분석: 입장 참가자 vs 활성 참가자, 질문 수, 업보트, 투표 수. ([Slido — Analytics](https://www.slido.com/features-analytics), [Slido Community — What are Slido Analytics](https://community.slido.com/analytics-and-exports-230/what-are-slido-analytics-471), [Organization Analytics](https://community.slido.com/organization-settings-analytics-239/what-are-organization-analytics-479))
- Kirkpatrick Level 1(반응): 만족·몰입·**현업 관련성**. 관련성이 이후 적용(Level 3)을 가장 잘 예측. 5~10문항, 2~3분, 세션 종료 직후 현장 응답이 이메일 후속보다 응답률 압도. 평점 문항마다 주관식 짝 권장. NPS("추천하시겠습니까")는 소비 촉진 지표로 유용하나 효과성 지표로는 오해 소지. ([Formbricks](https://formbricks.com/blog/training-survey-questions), [Valamis — Kirkpatrick](https://www.valamis.com/hub/kirkpatrick-model), [eLeap](https://www.eleapsoftware.com/training-survey-questions/), [Training Industry — Beyond the smile sheet](https://trainingindustry.com/magazine/summer-2022/beyond-the-smile-sheet-measuring-level-1-to-improve-learning-design/), [BizLibrary](https://www.bizlibrary.com/blog/training-programs/the-kirkpatrick-model-a-closer-look-into-the-training-program-evaluation-model/))
- 국내 교육만족도 설문 관행: 7~10문항, 객관식(5점 리커트) 앞·서술형 뒤, 하위 차원은 강사(전달력·소통), 내용(유익성·난이도), 운영(환경·시간), 종합 만족·추천. ([링글 — 교육 만족도 조사](https://www.ringleplus.com/en/student/landing/blog/education-satisfaction-survey), [서울시 교육만족도 조사 문항 개선 계획](https://opengov.seoul.go.kr/sanction/22558077), [연세대 프로그램 만족도 설문지](https://library.yonsei.ac.kr/education/download/7365))

**표준 만족도 문항 제안(5점 리커트 + 주관식 1).** 90초 안에 끝나도록 5+1 문항.

| # | 차원 | 문항 | 근거 |
|---|---|---|---|
| S1 | 종합 | 오늘 강연에 전반적으로 만족한다 | Kirkpatrick L1 만족 |
| S2 | 관련성 | 강연 내용은 내 업무·일상에 적용할 만하다 | L1 관련성(L3 예측력 최고) |
| S3 | 강사 | 강연자의 설명은 이해하기 쉬웠다 | 국내 설문 공통 차원 |
| S4 | 몰입 | 강연 시간 동안 집중이 잘 유지되었다 | L1 몰입 |
| S5 | 추천 | 동료에게 이 강연을 추천하겠다 (0~10) | NPS, 주최측 보고용 |
| S6 | 주관식 | 가장 기억에 남는 한 가지 / 개선했으면 하는 한 가지 | 평점 짝 주관식 |

**요구사항.**

| ID | 요구 | 동작 디테일(UX) | 우선순위 |
|---|---|---|---|
| A7-1 | **만족도 설문 활동 타입** | `survey` 활동: 리커트 5점(탭 1회) + NPS 0~10 슬라이더 + 주관식. 위 S1~S6 표준 세트 프리셋, 문항 추가·삭제 가능 | P0 |
| A7-2 | **1페이지 PDF 리포트** | 세션 종료 시 자동 생성: 접속/활성 참가자 수·참여율, 활동별 응답률, 투표·퀴즈 결과 차트, 워드클라우드 이미지, 만족도 평균·분포·NPS, 주관식 상위 발췌(익명). 주최 로고·강연 제목·일시 헤더 | P0 |
| A7-3 | 리포트 **공유 링크 + 엑셀** | 주최측에 보낼 읽기 전용 링크(만료 30일) + CSV/XLSX(문항별 원자료, 익명) | P0 |
| A7-4 | 참여율 정의 통일 | 참여율 = 활동 1개 이상 응답한 참가자 / 접속 참가자. 접속 참가자 = 입장 완료 고유 세션 토큰. 리포트에 정의 각주 | P1 |
| A7-5 | 강연자 포트폴리오 | 강연자 계정에 세션별 만족도·NPS 추이, "최근 10회 평균 4.6/5" 카드. 영업 자료로 이미지 다운로드 | P1 |
| A7-6 | 청중용 사후 페이지 | 설문 제출 후 화면에 자료 다운로드 QR·강연자 연락처(선택)·"오늘의 워드클라우드" 공유 이미지 | P2 |
| A7-7 | 이메일 수집은 **별도 옵트인** | 자료 받기 원할 때만 이메일 입력(선택). 설문과 분리 저장, 기본 리포트에는 미포함 | P1 |

### 축 8. 청중이 꺼리는 것 — 개인정보, 앱 설치, 소리

**왜 중요한가.** 참여의 반대편에는 "거절 비용"이 있다. 앱 설치·회원가입·이메일 요구·갑작스런 소리는 각각 참여율을 깎는 독립 요인이며, 특히 직장 행사에서 개인 폰의 개인정보를 회사 도구에 넣는 데 대한 거부감이 크다.

**근거.**
- 앱 설치: 담당자 42%가 미설치 문제, 폰 용량·"또 앱" 피로. 웹 링크가 해법. ([Endless Events](https://helloendless.com/event-app-platform-adoption/), [Cvent — App adoption](https://www.cvent.com/en/blog/events/complete-guide-increasing-event-app-adoption))
- 개인정보: 행사 데이터는 명시적 옵트인, 수집 목적 고지, 삭제권. Wi-Fi 로그인·앱을 통한 데이터 수집이 스폰서 공유·리마케팅에 쓰이는 데 대한 우려. 익명과 식별 피드백을 목적에 따라 분리하는 것이 관행. ([Cvent — GDPR for events](https://www.cvent.com/en/blog/events/gdpr-events-guide), [Pisano — GDPR feedback](https://www.pisano.com/en/academy/how-gdpr-compliance-affects-customer-feedback-collection))
- 소리: 강연장에서 무음 요청은 당연시. 흥미롭게도 무음 모드일수록 폰을 더 자주 확인한다는 연구(FoMO 높은 사용자)가 있어, 도구가 소리를 내면 "참여 도구"가 "방해 도구"로 전환된다. ([Manner of Speaking](https://mannerofspeaking.org/2015/08/22/how-to-deal-with-mobile-devices-when-you-are-on-stage/), [Computers in Human Behavior 2022 — Sound of silence](https://www.sciencedirect.com/science/article/abs/pii/S0747563222001601))
- Kahoot 대형 행사: 부적절 닉네임이 스크린에 뜨는 것 자체가 리스크 → 자동 생성기. ([Kahoot — Guide for one-time events](https://support.kahoot.com/hc/en-us/articles/11166126591891-Guide-for-one-time-events))

**요구사항.**

| ID | 요구 | 동작 디테일(UX) | 우선순위 |
|---|---|---|---|
| A8-1 | 청중 화면 **소리 0** | 청중 페이지는 오디오 재생 요소 없음. 퀴즈 효과음·타이머 음은 프로젝터(강연장 스피커)에서만 | P0 |
| A8-2 | 진동·푸시 없음 | 활동 오픈 알림은 화면 전환만. Web Push·Vibration API 미사용 | P0 |
| A8-3 | **수집 데이터 명시 1줄** | 입장 화면 하단: "닉네임과 응답만 저장되며 개인정보는 수집하지 않습니다". 설정에서 문구 편집 | P0 |
| A8-4 | 카메라 권한은 QR 스캔 앱에만 | 웹 페이지는 카메라·위치·연락처 권한을 절대 요청하지 않음 | P0 |
| A8-5 | 이메일·전화 필드 기본 없음 | 축 7 A7-7과 동일. 주최측이 켜도 "선택" 라벨 강제 | P1 |
| A8-6 | 부적절 응답 필터 | 자유응답·닉네임에 금칙어 필터(한국어 욕설·비하 사전), 걸리면 프로젝터 미노출 + 진행자 큐로 이동 | P1 |
| A8-7 | 화면 밝기 배려 | 청중 페이지 기본 다크 테마(어두운 객석에서 옆사람 방해 최소), 큰 탭 타깃(최소 48px) | P1 |
| A8-8 | 세션 종료 시 데이터 보관 고지 | 종료 화면에 "응답은 익명 집계로 90일 보관 후 삭제" 등 정책 표시 | P2 |

---

## 3. 요구사항 통합 목록(우선순위별)

| 우선순위 | ID | 한 줄 요약 |
|---|---|---|
| P0 | A1-1 | 프로젝터 상시 입장 바(QR·코드·URL) |
| P0 | A1-2 | QR 딥링크로 코드 자동 입력 |
| P0 | A1-3 | 닉네임 자동 생성 + 1탭 입장 |
| P0 | A1-4 | 로그인·앱 설치 0, 토큰으로 재접속 복구 |
| P0 | A2-1 | 세션 익명 정책 4모드 |
| P0 | A2-2 | 활동 단위 익명 오버라이드 + 상태 뱃지 |
| P0 | A2-3 | 익명 활동 프로젝터에 이름 미표시 |
| P0 | A2-4 | 결과 숨김→공개 제어 |
| P0 | A3-1 | 1,000명 동시 입장·제출 부하 테스트 |
| P0 | A3-2 | 소켓 재접속 지터·백오프 + 서버 속도제한 |
| P0 | A3-3 | 결과 브로드캐스트 배치·스로틀 |
| P0 | A3-4 | 저대역폭 청중 페이지 |
| P0 | A4-1 | 프로젝터 강당 모드(텍스트 ×1.5) |
| P0 | A4-2 | 고대비 단색 배경 |
| P0 | A4-3 | 선택지 4개 이하 + 색·도형 코드 |
| P0 | A5-1 | 90분 강연 템플릿 |
| P0 | A5-2 | 워밍업 활동 = 입장 확인 |
| P0 | A5-3 | 활동 타이머 + 자동 마감 |
| P0 | A6-1 | 원버튼 진행 상태 머신 |
| P0 | A6-2 | 폰 리모컨 모드 |
| P0 | A6-3 | 보조 진행자 역할 |
| P0 | A7-1 | 만족도 설문 활동 타입(표준 6문항) |
| P0 | A7-2 | 1페이지 PDF 리포트 자동 생성 |
| P0 | A7-3 | 리포트 공유 링크 + 엑셀 |
| P0 | A8-1 | 청중 화면 소리 0 |
| P0 | A8-2 | 진동·푸시 없음 |
| P0 | A8-3 | 수집 데이터 명시 1줄 |
| P0 | A8-4 | 카메라 등 권한 요청 없음 |
| P1 | A1-5, A1-6, A1-7, A2-5, A2-6, A2-7, A3-5, A3-6, A3-7, A4-4, A4-5, A4-6, A4-7, A5-4, A5-5, A5-6, A6-4, A6-5, A6-6, A7-4, A7-5, A7-7, A8-5, A8-6, A8-7 | 품질 차이 항목 |
| P2 | A1-8, A2-8, A3-8, A3-9, A4-8, A5-7, A6-7, A6-8, A7-6, A8-8 | 차별화 항목 |

---

## 4. 90분 강연 표준 타임라인 — 참여 활동 배치 예시

전제: 14:00 시작, 15:30 종료. 활동 7개(입장 워밍업 1, 중간 환기 3, Q&A 1, 설문 1, 마무리 1). 활동 간 최대 간격 17분(Bunce 4.5분 주기를 감안하면 짧을수록 좋지만 성인 강연의 내용 밀도와 타협). 각 행의 "원버튼"은 강연자 또는 보조 진행자가 누르는 단 하나의 조작.

| 시각 | 구간 | 참여 활동 | 프로젝터 화면 | 청중 화면 | 원버튼 | 목적·근거 |
|---|---|---|---|---|---|---|
| 13:50~14:00 | 입장·대기 | (없음) 대기 화면 | QR 초대형 + 코드 + URL + "접속 0명" 카운터 + 1줄 안내("닉네임은 자동 생성, 개인정보 수집 없음") | 입장 → 닉네임 자동 채움 → [입장] | 세션 시작 | A1-1~4, A8-3. 10분 전부터 띄워 입장 스파이크를 분산(A3-7 취지) |
| 14:00~14:03 | 오프닝 | **W1 워드클라우드** "한 단어로, 오늘 이 강연에서 얻고 싶은 것은?" | 단어가 실시간으로 커지는 클라우드, 접속 수 | 단어 1개 입력(15자 제한) | [활동 열기] | 위험 0 질문으로 앱 진입 확인. Slido "한 단어로" 프레이밍. 응답 수 = 입장 확인(A5-2) |
| 14:03~14:05 | 오프닝 | W1 결과로 강연 목차 연결 | 상위 5단어 강조 | 대기("강연자를 봐주세요") | [결과 공개] | A5-7. 청중 언어로 목차를 재진술 |
| 14:05~14:20 | 강의 블록 1 | (없음) | 강연자 슬라이드(PPT) | 대기 화면(밝기 낮춤) | — | 15분 |
| 14:20~14:23 | 환기 1 | **P1 2지선다 의견 투표** "여러분 조직에서는 A/B 중 어느 쪽이 더 가깝습니까?" 익명, 결과 숨김 | 3초 카운트다운 → 응답 수 카운터 → 마감 후 막대(비율+명수) | 큰 버튼 2개(색+도형), 탭 즉시 "제출됨" | [활동 열기]→[마감·공개] | 밴드왜건 방지(A2-4). 정답 없는 질문으로 심리적 안전 유지 |
| 14:23~14:38 | 강의 블록 2 | (없음) 투표 결과 인용하며 진행 | PPT | 대기 | — | 15분 |
| 14:38~14:42 | 환기 2 | **Q1 이해도 퀴즈 1문항** (4지선다, 닉네임 표시, 30초 타이머) | 문항+선택지 → 정답 공개 → 상위 10 리더보드 | 4색 버튼, 남은 시간 | [활동 열기]→(자동 마감)→[정답 공개] | Bunce: 클리커 질문 직후 이탈 감소. 퀴즈만 닉네임(A2-2). 부담 낮추려 1문항·점수 비공개 옵션 |
| 14:42~14:45 | 휴식·환기 | 스트레칭 + **Q&A 상시 수집 안내** "지금부터 질문을 올려두세요, 👍로 밀어주세요" | Q&A 안내 + 입장 바 | 질문 입력 탭 노출 | [Q&A 열기] | 업보트를 미리 시키면 재활성화(Slido). 늦은 입장자 재안내(A1-7) |
| 14:45~15:00 | 강의 블록 3 | (없음) 질문은 백그라운드로 쌓임 | PPT | 질문 입력 가능 | — | 15분. 보조 진행자가 승인·중복 병합 |
| 15:00~15:03 | 환기 3 | **P2 척도 투표** "지금 이 방법을 내 업무에 적용할 수 있다고 느끼는 정도는?" 1~5 | 분포 막대 + 평균 | 1~5 큰 버튼 | [활동 열기]→[마감·공개] | 관련성 자기평가로 후반 몰입 유도. 결과가 낮으면 강연자가 사례 보강 |
| 15:03~15:15 | 강의 블록 4 | (없음) 사례·실행 단계 | PPT | 대기 | — | 12분 |
| 15:15~15:24 | Q&A | **업보트 상위 5개 질문 응답** | 질문 카드 1개씩 크게(👍 수), 답한 질문은 체크 | 내 질문 상태(답변됨/대기) | [다음 질문] | A5-4, A6-4. 익명 질문이라 민감 질문 가능 |
| 15:24~15:27 | 설문 | **S 만족도 설문** 표준 6문항(5점×4 + NPS + 주관식) | "설문 응답 중 312/412" + 자료 QR | 한 화면 스크롤 없이 탭 5회 + 주관식 선택 | [설문 열기] | 종료 직전 현장 응답이 응답률 최고(Kirkpatrick L1). 90초 목표 |
| 15:27~15:30 | 마무리 | **W2 워드클라우드** "한 단어로, 오늘의 수확은?" + 결과를 배경으로 인사 | 클라우드 + 자료 다운로드 QR + 강연자 연락처(선택) | 제출 후 사후 페이지(자료 QR, 이메일 옵트인) | [활동 열기]→[결과 공개]→[세션 종료] | W1과 대구를 이루는 마무리. 종료 시 리포트 자동 생성(A7-2) |
| 15:30 이후 | 사후 | 리포트 | — | — | — | 주최측에 PDF·링크 발송(A7-3) |

활동 간격 요약: 3 → 15 → 15 → 3(휴식) → 15 → 12 → 9(Q&A) → 3 → 3. 순수 강의 최장 구간 15분, 참여 포인트 7개, 청중이 폰을 드는 총 시간 약 12분.

**단축 버전(60분)**: W1 → 블록 1(15) → P1 → 블록 2(15) → Q1 → 블록 3(12) → Q&A(6) → S → W2. 활동 6개.

---

## 5. 상용 도구 대비 axedu 현재 상태

| 항목 | Slido | Mentimeter | Poll Everywhere | Kahoot | axedu 현재(commerce 브랜치) |
|---|---|---|---|---|---|
| 입장 | slido.com + #코드, QR, 링크. 모든 슬라이드에 안내 상시 | menti.com + 코드(임시), QR(영구), 링크 | 링크·코드, (2.0 SMS 없음) | PIN + 닉네임(자동 생성기), 2단계 입장 | 코드 + 닉네임 수동 입력. 프로젝터에 QR·코드 표시 없음 |
| 익명 | 4모드, 전 요금제 | 기본 익명 | 익명 확인 권장 | 닉네임 필수(게임) | 닉네임 필수, 익명 정책 없음 |
| 규모 | 100 / 200~5,000 / 20,000 | 플랜별 | 5,000+ | 2,000 / Large 5,000 | 교실 규모만 검증, 부하 테스트 없음 |
| 결과 숨김 | 있음 | H 키 토글 | 있음 | 게임 흐름 고정 | 활동별 없음 |
| 리모컨 | 모바일 호스트 | Mentimote(Pro) | 프레젠터 앱 | 호스트 폰 | 없음(Instructor 페이지 PC 가정) |
| 보조 진행자 | 공동 호스트 + 모더레이션 | 협업자 | 팀 계정 | 공동 호스트 | 없음 |
| Q&A 업보트 | 핵심 기능 | 있음 | 있음 | 없음 | 없음 |
| 설문 | 설문 활동 | Survey 모드(청중 페이스) | 설문 | 피드백 플레이북 | `survey` 타입 없음(poll·quiz만) |
| 리포트 | 참여율·질문·감성, PDF/Excel/Sheets | 엑셀·PDF | 리포트 | 결과 리포트 | Report 페이지(학습 리포트 중심) |
| 대형 스크린 | Present 모드 | 프레젠테이션 뷰 | 슬라이드 임베드 | 게임 화면 | Projector 페이지(교실 폰트: 제목 5xl≈48px) |

---

## 6. 결론 — axedu 시사점 5줄

1. **입장 경로를 "QR 스캔 → 자동 닉네임 → 1탭"으로 재설계하고 프로젝터에 QR·코드·접속 수 상시 바를 넣는 것**이 강당 특화의 첫 단추다. 현재 Projector 페이지에는 입장 정보가 전혀 없고 Join은 코드·닉네임을 모두 손으로 넣는다.
2. **익명 정책을 세션·활동 두 층으로 도입**하고 의견 투표·자유응답·Q&A는 익명 기본, 퀴즈만 닉네임으로 분리해야 직장인이 응답한다. 프로젝터에서 이름을 지우는 것만으로도 참여율이 달라진다.
3. **1,000명 동시 입장·제출 부하 테스트를 CI에 고정**하고 재접속 지터·서버 속도제한·집계 스로틀·저대역폭 페이지를 먼저 갖춘 뒤 영업해야 한다. 강당에서 첫 활동이 실패하면 세션 전체가 죽는다.
4. **90분 템플릿(활동 7개 슬롯) + 원버튼 상태 머신 + 폰 리모컨 + 보조 진행자 권한**을 묶어 "강연자는 버튼 하나, 나머지는 보조가"를 제품 메시지로 삼는다. 리듬 알림(마지막 활동 후 15분)이 차별화 포인트다.
5. **`survey` 활동 타입(표준 6문항)과 종료 시 1페이지 PDF 리포트 자동 생성**이 HRD·주최측 재구매를 만든다. 청중 화면은 소리·진동·권한·이메일 필수 입력을 모두 제거해 "거절 비용 0"을 보장한다.

---

## 출처 목록

**진입·QR·앱 채택**
- https://help.mentimeter.com/en/articles/1382424-get-ready-for-your-in-person-menti
- https://help.mentimeter.com/en/articles/422271-share-qr-code
- https://help.mentimeter.com/en/articles/2780681-how-long-is-my-join-code-valid
- https://help.mentimeter.com/en/articles/5766150-show-the-participation-instructions-with-an-instructions-slide
- https://community.slido.com/community-questions-7/is-there-a-limit-to-the-audience-participation-3252
- https://www.uniqode.com/blog/qr-code-best-practices/how-to-perfectly-size-your-qr-codes
- https://scanova.io/blog/qr-code-scanning-distance/
- https://qrlynx.com/blog/qr-code-size-guide-print
- https://support.kahoot.com/hc/en-us/articles/11166126591891-Guide-for-one-time-events
- https://helloendless.com/event-app-platform-adoption/
- https://www.nunify.com/blogs/event-app-adoption-rate-benchmarks
- https://www.cvent.com/en/blog/events/complete-guide-increasing-event-app-adoption
- https://event-us.kr/hostcenter/blog/368/nametag_qrcode

**익명·심리적 안전**
- https://blog.slido.com/anonymous-questions-q-and-a/
- https://blog.slido.com/psychological-safety/
- https://community.slido.com/security-privacy-essentials-224/participant-privacy-choose-anonymous-or-named-participation-1609
- https://community.slido.com/community-q-a-7/how-do-i-track-participants-by-name-while-they-still-remain-anonymous-to-other-participants-3617
- https://help.mentimeter.com/en/articles/422266-hide-or-show-results
- https://educationexpress.uts.edu.au/collections/engaging-your-audience-with-mentimeter-polls/resources/best-practice-in-mentimeter/
- https://www.polleverywhere.com/use-cases/best-audience-response-tools-2026
- https://www.jobkorea.co.kr/Corp/Lounge/News_View?GI_Trend_News_No=693

**네트워크·규모**
- https://www.purple.ai/en-gb/guides/wifi-for-events-how-to-deliver-reliable-connectivity-for-large-crowds
- https://mrnet.us/blog/live-event-internet-production
- https://www.impli-cit.com/blog/why-do-event-venues-need-wifi-site-surveys-before-large-gatherings/
- https://support.kahoot.com/hc/en-us/articles/115003072287-How-many-participants-can-play-a-kahoot
- https://joeybabcock.me/blog/tutorial/setting-up-a-large-scale-kahoot-2/
- https://support.polleverywhere.com/hc/en-us/articles/44235308703131-Audience-Size-Limits-in-Poll-Everywhere-2-0
- https://support.polleverywhere.com/hc/en-us/articles/1260801546910-SMS-Text-messaging
- https://websocket.org/guides/connection-limits/
- https://encore.dev/blog/thundering-herd-problem
- https://redis.io/blog/how-to-tame-the-thundering-herd-problem/
- https://evilmartians.com/chronicles/real-time-stress-anycable-k6-websockets-and-yabeda

**가독성**
- https://presentationguild.org/how-big-big-enough-the-8h-rule-reveals-all/
- https://www.presentations.ai/blog/what-font-size-is-best-for-presentations
- https://www.beautiful.ai/blog/what-font-size-is-best-for-presentations
- https://www.slido.com/product
- https://www.polleverywhere.com/audience-response-system

**리듬·주의**
- https://eric.ed.gov/?id=EJ921304 (Bunce, Flens & Neiles 2010, J. Chem. Educ.)
- https://www.facultyfocus.com/articles/teaching-and-learning/students-attention-interesting-analysis/
- https://www.researchgate.net/publication/234649194_Attention_During_Lectures_Beyond_Ten_Minutes (Wilson & Korn 2007)
- https://journals.physiology.org/doi/full/10.1152/advan.00109.2016
- https://www.duarte.com/blog/how-to-interact-with-audience-members-while-you-present/
- https://www.polleverywhere.com/case-studies/lecture-method
- https://blog.slido.com/word-cloud-examples/
- https://blog.slido.com/how-to-use-live-polling-in-a-presentation/
- https://blog.slido.com/fix-your-qa-session/

**발표자 부담**
- https://www.mentimeter.com/blog/menti-news/live-presentation-or-survey-the-ultimate-guide-to-voting-pace
- https://help.mentimeter.com/en/articles/2233579-mentimote-our-presentation-remote
- https://blog.slido.com/slido-cheat-sheet-for-moderators/
- https://community.sli.do/audience-q-a-42/use-moderation-and-manage-audience-questions-477
- https://static.sli.do/documents/all-hands-and-town-halls-use-case.pdf

**사후 활용·설문**
- https://www.slido.com/features-analytics
- https://community.slido.com/analytics-and-exports-230/what-are-slido-analytics-471
- https://community.slido.com/organization-settings-analytics-239/what-are-organization-analytics-479
- https://formbricks.com/blog/training-survey-questions
- https://www.valamis.com/hub/kirkpatrick-model
- https://www.eleapsoftware.com/training-survey-questions/
- https://trainingindustry.com/magazine/summer-2022/beyond-the-smile-sheet-measuring-level-1-to-improve-learning-design/
- https://www.bizlibrary.com/blog/training-programs/the-kirkpatrick-model-a-closer-look-into-the-training-program-evaluation-model/
- https://www.ringleplus.com/en/student/landing/blog/education-satisfaction-survey
- https://opengov.seoul.go.kr/sanction/22558077
- https://library.yonsei.ac.kr/education/download/7365

**청중이 꺼리는 것**
- https://www.cvent.com/en/blog/events/gdpr-events-guide
- https://www.pisano.com/en/academy/how-gdpr-compliance-affects-customer-feedback-collection
- https://mannerofspeaking.org/2015/08/22/how-to-deal-with-mobile-devices-when-you-are-on-stage/
- https://www.sciencedirect.com/science/article/abs/pii/S0747563222001601
