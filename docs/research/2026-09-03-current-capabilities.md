# axedu 현황 인벤토리 + 대규모 동접(400명) 기술 점검

- 작성일: 2026-09-03
- 대상 코드: `commerce` 브랜치 (HEAD `eaefc53`), 워크트리 `H:/profNoh-commerce`
- 근거: `shared/types.ts`, `server/src/**`, `client/src/**`, `deploy/**` 를 직접 읽음. 모든 주장 옆에 파일:라인을 적었다.
- 목적: 일반인·직장인 대상 **대규모 강당 강연 특화** 로드맵의 근거 자료 (R3).

---

## 0. 한눈에 보기

| 항목 | 현재 값 | 근거 |
|---|---|---|
| 서버 | Fastify 5 + socket.io 4.8, Node 22, 단일 프로세스 (docker 컨테이너 1개) | `server/package.json`, `Dockerfile`, `deploy/DEPLOYMENT.md` |
| 라이브 상태 | **전부 프로세스 메모리** (`Map`), DB는 best-effort 사후 기록만 | `server/src/state.ts:291-292`, `server/src/persist.ts:4` |
| DB | Supabase(자체 호스팅 PostgREST) 6개 `axedu_*` 테이블 + 덱/유저/구독/조직 | `README.md:94`, `deploy/migrations/*.sql` |
| 활동 | 9종: chat / image / lab / quiz / poll / roleplay / analogy / writing / tutor | `shared/types.ts:29` |
| 슬라이드 소스 | 4종: PDF 업로드 / 이미지 묶음 / 외부 임베드(iframe) / 마크다운 붙여넣기 (+ AI 생성, 직접 편집) | `server/src/routes.ts:352,410`, `client/src/components/SourceImportCard.tsx` |
| 입장 | 6자리 코드(혼동 문자 제외) + 닉네임(12자), 로그인 없음, QR은 코드가 미리 채워진 `/join?token=` 링크 | `server/src/state.ts:15`, `client/src/pages/Join.tsx:44-60`, `client/src/pages/Instructor.tsx:144-149` |
| AI 백엔드 | MiniMax-Text-01(텍스트), Stability Core(이미지), 키 라운드로빈 | `server/src/ai/minimax.ts`, `server/src/ai/stability.ts` |
| 쿼터 | 1인당 활동별 대화 8회·이미지 4회, 강의실 예산 15 USD, 강사 일시정지 | `server/src/env.ts:47-49`, `server/src/state.ts:265-278` |
| 요청 제한(rate limit) | **없음** (HTTP·socket 모두) | `grep rate-limit` 결과 0건, `server/src/index.ts` |
| 익명 참여 시 수집 정보 | 닉네임, 브라우저 localStorage UUID(sessionId), 점수, 퀴즈/투표 응답, AI 입력문 원문(랩), 사용량 | `server/src/persist.ts`, `client/src/lib/session.ts` |

---

## 1. 기능 인벤토리

### 1.1 역할·화면 구성

| 경로 | 역할 | 인증 | 소켓 이벤트 | 근거 |
|---|---|---|---|---|
| `/join` → `/play?token=` | 참가자(학생) | 없음 (코드+닉네임) | `student:join` | `client/src/App.tsx:23-24`, `client/src/pages/Student.tsx:25` |
| `/teach` | 강사 콘솔 | Google 로그인 필수(AuthGate) | `instructor:join` (token + instructorSecret 24자) | `client/src/App.tsx:25`, `server/src/socket.ts:26-38` |
| `/screen/:token` | 프로젝터(뷰어) | 없음, 참가자 미생성 | `viewer:join` | `client/src/pages/Projector.tsx:18`, `server/src/socket.ts:61-70` |
| `/report/:classroomId?secret=` | 수업 리포트 | instructorSecret 쿼리 | REST only | `server/src/routes.ts:711-731` |
| `/build`, `/build/:deckId` | 덱 제작·편집 | 로그인 + 편집 PIN 6자리 | REST only | `server/src/routes.ts:225-298` |

강사 자격(token/secret)은 브라우저에 저장하지 않는다. 새로고침하면 강의 선택 화면으로 돌아가며, 기존 강의실에 **재접속할 방법이 UI에 없다** (`client/src/pages/Instructor.tsx:16-22`, `client/src/lib/session.ts:37-38`).

### 1.2 입장 흐름 (코드 / QR)

| 단계 | 동작 | UX 디테일 | 근거 |
|---|---|---|---|
| 1 | 강사가 `/teach`에서 덱 선택 → `POST /api/classrooms` | 강의실 토큰 6자(`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 0/O/1/I/L 제외) 즉시 발급, DB에 `axedu_classrooms` insert를 **await** | `server/src/state.ts:15`, `server/src/routes.ts:62-76` |
| 2 | 강사 헤더에 코드 대문자 표시, 클릭 시 클립보드 복사, 「📱 QR로 초대」모달 | QR은 `${origin}/join?token=XXXXXX` 를 `qrcode` 라이브러리로 320px PNG 생성. 모달 안에 코드도 병기 | `client/src/pages/Instructor.tsx:144-149,506-530` |
| 3 | 참가자 `/join` | 코드 입력(6자, 자동 대문자, letter-spacing 0.3em), 닉네임(최대 12자, localStorage에 기억). `GET /api/classrooms/:token` 으로 존재 확인 후 `/play` 이동 | `client/src/pages/Join.tsx:14-35,44-60` |
| 4 | `/play` 에서 소켓 `student:join` | sessionId = localStorage UUID(없으면 생성). 서버는 `upsertParticipant` → `persistParticipant` **await** → `joined`·`state` emit → 현재 열린 활동 동기화 → 전체에 `participants` 브로드캐스트 | `client/src/lib/session.ts:21-28`, `server/src/socket.ts:41-58` |
| 5 | 재접속 | 같은 sessionId면 기존 참가자·점수 복원. 닉네임 변경 시 덮어씀 | `server/src/state.ts:66-76` |

참가자 수는 **누적 입장 수**다. `participants` Map에서 제거하는 코드가 없어 퇴장해도 줄지 않는다 (`server/src/state.ts:82-84`, `socket.ts:200-203` 은 count만 재전송).

### 1.3 슬라이드 소스 4종 + 발표 모드

| 소스 | 만드는 법 | 렌더링 | 제한 | 근거 |
|---|---|---|---|---|
| **PDF** | `/build` 에서 파일 선택 → base64 JSON으로 `POST /api/decks/upload-pdf` (본문 50MB 제한) → 서버가 정규식으로 페이지 수 추정 → 페이지당 `layout:'pdf'` 슬라이드 생성 | 클라이언트가 pdf.js 3.11(cdnjs)로 **각 참가자 브라우저에서 원본 PDF를 내려받아** 캔버스 렌더. DPR 최대 4배 | 페이지 수 추정이 정규식 기반(`/Count`)이라 오판 가능. PDF 파일에 `Cache-Control` 없음 | `server/src/routes.ts:36-55,352-407`, `client/src/components/SlideView.tsx:50-147`, `client/index.html:6` |
| **이미지 묶음** | png/jpg/webp/gif 최대 100장을 base64로 `POST /api/decks/upload-images` → 순서대로 `layout:'image'` | `<img object-contain>`; 이미지 응답엔 `Cache-Control: max-age=86400` | 한 요청에 100장 base64 → 본문 50MB 한도에 걸릴 수 있음 | `server/src/routes.ts:410-468,331-349` |
| **임베드** | Google Slides(게시 링크)·Canva·YouTube·Figma·Slides.com·Gamma·Prezi·Miro·Pitch·Tome·OneDrive·Office Online 화이트리스트. Google 편집 링크는 `/preview` 로, Canva는 `?embed` 로 정규화 | sandboxed `<iframe>`. **강사 화살표 키가 iframe 포커스에 먹힘**, 페이지 넘김은 임베드 자체 컨트롤 → 참가자 화면과 페이지가 동기화되지 않음 | naver/instagram/facebook/notion 명시 차단 | `client/src/lib/embed.ts:18-121`, `client/src/components/SlideView.tsx:5-24` |
| **마크다운** | 텍스트 붙여넣기: `#`=섹션 슬라이드, `##`=새 콘텐츠 슬라이드, `-`/`*`=불릿, `>`=인용, `###`=소제목, 그 외=문단(`**굵게**` 제거) | 텍스트 레이아웃(title/section/content) 중앙 정렬, 블록 최대 12개·400자 | 이미지·코드블록·표 미지원 | `client/src/components/SourceImportCard.tsx:12-45`, `server/src/decks/validate.ts:150-153` |
| (참고) AI 생성 | 주제→덱 초안, PDF 텍스트 기반 퀵 생성(계획→병렬 생성 2단계) | — | 로그인·플랜 제한(free 덱 3개) | `server/src/routes.ts:243-255,497-510`, `server/src/billing/plans.ts` |

**발표 모드(강사)**: `F` 키 또는 「⛶ 발표」 버튼 → 모든 UI 숨김 + 브라우저 전체화면. 화면 하단에 반투명 칩 `n/N · 다음 액션 (Space)` 하나만 남고 `Space`가 "원버튼 진행"(다음 슬라이드 / 활동 열기 / 퀴즈 시작·공개·다음 / 활동 닫고 다음)을 실행. `L` 리더보드 서랍, `Esc` 종료. 입력 요소 포커스 시 단축키 무시 (`client/src/pages/Instructor.tsx:129-197,232-264,351-377`).

**프로젝터**: 항상 고대비 다크 테마. 슬라이드 / 퀴즈 문제(5xl 제목, 카운트다운 바, 4색 도형 보기, 응답 수) / 정답 공개(정답 초록 강조 + 보기별 인원 + 우측 순위) / 투표(제목 + PollView) 4개 상태. `F` 전체화면, `L` 리더보드 (`client/src/pages/Projector.tsx:84-152`).

### 1.4 활동 9종 상세 스펙

| 타입 | 참가자 입력 | 서버 처리 | 참가자 화면 표시 | 점수 | 프로젝터 뷰 | 강사 콘솔 표시 | 근거 |
|---|---|---|---|---|---|---|---|
| **quiz** | 4지선다(보기 2~4개, 120자) 버튼 1회 탭. 문제 200자, 제한 5~120초(5초 단위 슬라이더), 해설 300자, 문항 최대 30 | `student:quizAnswer` 소켓. 서버 시각 기준 `Date.now()-quizStartAt`, 마감 +1.5s 유예. 중복 응답 무시 | 문제 n/N, 카운트다운(100ms 갱신), 4색(빨·파·황·초)+도형(▲◆●■) 버튼. 응답 후 "응답 완료! 결과를 기다려요…". 공개 시 🎉정답/😅오답/⏳미응답 + 정답 텍스트 + 해설 | 정답 시 `round(1000 × (1 − 경과비율 × 0.5))` → 500~1000점, 오답 0 | 문제/공개 전용 풀스크린 레이아웃 (1.3 참고) | 문항 텍스트·보기·실시간 응답 수, 공개 후 보기별 인원+해설. 진행은 원버튼 | `server/src/state.ts:134-219`, `client/src/components/activities/QuizStudent.tsx`, `server/src/decks/validate.ts:54-64` |
| **poll · 객관식(choice)** | 보기 2~8개(60자) 중 1개 탭 | `student:pollVote` → `pollAnswers[activityId][sessionId]=값` (재투표 시 덮어씀) → **매 표마다** 전체 분포 재계산 후 방 전체 브로드캐스트 | 투표 후 "참여 완료!" + 막대 그래프(n명·%) + 「다시 응답하기」 | 없음 | 제목 + 가로 막대 | 동일 PollView | `server/src/state.ts:222-237`, `server/src/socket.ts:165-173`, `client/src/components/PollView.tsx:125-148` |
| **poll · 자유단어(wordcloud)** | 텍스트 1개(입력 20자, 서버 40자 절단) | 동일. 분포에 `entries:[{nickname,value}]` **전원 목록 포함** | 제출 후 롤링페이퍼 기본, 버튼으로 워드클라우드 전환 | 없음 | **롤링페이퍼**: 포스트잇 7색, 닉네임 서명, 해시 기반 지터·회전(±12°), 열 수 `max(3, ceil(sqrt(n×1.5)))`. **워드클라우드**: `wordcloud` 라이브러리, 가로 배치만(한글 가독성), 높이 260~420px | 동일 | `client/src/components/PollView.tsx:18-97,106-122`, `server/src/state.ts:224` |
| **chat** | 자유 텍스트(2000자 안전필터 상한), 미션 칩(120자) 원클릭 | `POST /api/ai/chat`: 안전필터 → 쿼터(대화 8회) → 덱의 systemPrompt(클라이언트엔 미노출) + 최근 10턴 → MiniMax | 말풍선 채팅, "AI가 생각하는 중…" | 없음 | 없음 (슬라이드 유지) | "학생들이 실습 중이에요 🧑‍💻" 한 줄 | `server/src/routes.ts:95-130`, `server/src/decks/index.ts:24-27` |
| **image** | 장면 묘사 텍스트, 제안 칩 | 안전필터 → 쿼터(이미지 4회) → MiniMax로 영어 40단어 프롬프트 변환 → Stability Core 1:1 PNG → base64 dataURL 반환 | 3열 그리드에 누적, `[데모]` 표시(키 없을 때 1px placeholder) | 없음 | 없음 | 위와 동일 | `server/src/routes.ts:132-180`, `server/src/ai/stability.ts` |
| **lab** (prompt/context/harness) | 과제 텍스트 1줄, 예시 칩(최대 8) | A/B 두 프롬프트를 **동시에 2회** MiniMax 호출. `cannedResults`가 있으면 클라이언트가 900ms 지연 후 고정 결과 표시(서버 호출 없음) | 2열 패널(라벨A/라벨B) + "두 결과의 차이가 보이나요?" | 없음 | 없음 | 동일 | `server/src/ai/lab.ts`, `client/src/components/activities/LabActivity.tsx:29-44` |
| **roleplay** | 채팅 | systemPrompt + 미션 지침, 최근 10턴. 응답에 `missionKeyword`(공백 무시)가 포함되면 `missionClear:true` | 미션 카드(TARGET → MISSION CLEAR 초록 전환) + 채팅 | 클리어 시 클라이언트가 `student:roleplayClear` emit → 서버 1회 한정 **+500점**, 리더보드 브로드캐스트 | 없음 | 동일 | `server/src/routes.ts:513-554`, `server/src/state.ts:252-262` |
| **analogy** | 개념 단어 1개 | 페르소나 A/B 눈높이 설명을 JSON으로 요구, 파싱 실패 시 원문을 A에 표시 | 2열 카드(브랜드색/경고색) | 없음 | 없음 | 동일 | `server/src/routes.ts:557-616` |
| **writing** (poem/story/essay) | 키워드·첫 문장 textarea, 장르 선택(덱에 고정되면 잠금) | 장르별 시스템 프롬프트, 250자 내외 창작 | 엽서·원고지 스타일 카드, "To. {닉네임} 님에게" | 없음 | 없음 | 동일 | `server/src/routes.ts:619-660`, `client/src/components/activities/WritingStudent.tsx` |
| **tutor** (math/coding/general) | 풀이·코드·질문 텍스트 | 소크라테스식: 정답 금지, 힌트 3줄 이내 | 과제 설명 카드 + 채팅, 과목 뱃지 | 없음 | 없음 | 동일 | `server/src/routes.ts:663-708` |

AI 활동 7종(chat/image/lab/roleplay/analogy/writing/tutor)은 **모두 REST**(`fetch`)이고 결과는 제출한 본인 화면에만 남는다. 다른 참가자·프로젝터·강사는 볼 수 없고, 강사는 "실습 중" 문구만 본다. 점수가 붙는 활동은 quiz와 roleplay 둘뿐이다.

### 1.5 리더보드

| 항목 | 값 | 근거 |
|---|---|---|
| 정렬 | 점수 내림차순, 동점 시 닉네임 `localeCompare` | `server/src/state.ts:98-103` |
| 전송 범위 | **상위 100명** 전체 배열 (`topN = 100`) | 같은 곳 |
| 닉네임 중복 | 서버는 sessionId로 구분하나 클라이언트 표시·"내 점수" 조회는 닉네임 문자열 매칭 → 동명이인이면 내 점수가 남의 점수로 보일 수 있음 | `client/src/pages/Student.tsx:32-33`, `client/src/components/Leaderboard.tsx:22` |
| 표시 위치 | 강사: 우측 사이드 패널(compact) + `L` 서랍 / 프로젝터: 정답 공개 화면 우측 1/3 + `L` 서랍 / 참가자: 헤더에 ⭐내 점수만 | `client/src/pages/Instructor.tsx:479-504`, `client/src/pages/Projector.tsx:59-74,105-108` |
| 갱신 시점 | 퀴즈 정답 공개, 마지막 문제 다음, 역할극 클리어 | `server/src/socket.ts:112-134,175-189` |

### 1.6 익명 질문(Q&A)

참가자 화면 좌하단 ❓ 플로팅 버튼 → 모달(300자) → `student:askQuestion`. 서버는 닉네임을 **저장하지 않고** 텍스트만 최신순 200개 메모리 보관, 방 전체(강사·프로젝터·다른 참가자 소켓 포함)에 `question:new` 브로드캐스트. 강사 헤더 「❓ 질문 (n)」 모달에서 최신순 열람, 시각은 "n분 전". 답변 완료 표시·공감(upvote)·프로젝터 노출·DB 저장 없음 (`server/src/state.ts:239-249`, `server/src/socket.ts:192-198`, `client/src/pages/Instructor.tsx:532-552`).

### 1.7 리포트(/report)

| 탭 | 내용 | 근거 |
|---|---|---|
| 개요 | 총 참여 인원, 누적 AI 비용(USD), 안전 차단 횟수, AI 유형별 호출 수, 참가자별 AI 사용량·비용, 참가자 목록(점수·참가일시) | `server/src/routes.ts:760-792,910-945`, `client/src/pages/Report.tsx:270-283` |
| 퀴즈 | 문항별 정답률·보기 분포·학생별 응답(정오·ms·점수). 덱에서 삭제된 문항은 "삭제된 문제" | `server/src/routes.ts:793-853` |
| 투표 | 활동별 총 표·값 분포·학생별 값 | `server/src/routes.ts:855-895` |
| 비교실습 | 학생별 입력·A/B 설정·A/B 출력 원문 | `server/src/routes.ts:897-908` |
| 출력 | `window.print()` 인쇄 CSS만. CSV/PDF 내보내기·이메일 발송 없음 | `client/src/pages/Report.tsx:144-200` |

리포트는 DB에 기록된 것만 집계하므로 Supabase가 꺼져 있으면 503, 메모리에서만 진행된 세션은 리포트가 비어 있다 (`server/src/routes.ts:714-716`).

### 1.8 안전·쿼터·과금

| 제어 | 동작 | 근거 |
|---|---|---|
| 콘텐츠 안전필터 | 한국어 정규식 6종(성적·자해·위험·욕설·딥페이크·주민번호) + 2000자 상한. 차단 시 `axedu_ai_usage` 에 `blocked` 기록 | `server/src/ai/safety.ts` |
| 1인 쿼터 | `sessionId|activityId|type` 키로 카운트. chat 계열(lab/roleplay/analogy/writing/tutor 포함) 8회, image 4회. **활동을 바꾸면 초기화** | `server/src/state.ts:265-283`, `server/src/env.ts:47-48` |
| 강의실 예산 | 호출당 고정 추정치(대화 0.002 USD, 이미지 0.03 USD) 누적, 15 USD 초과 시 전원 차단 | `server/src/ai/minimax.ts:9`, `server/src/ai/stability.ts:3`, `server/src/state.ts:267-268` |
| 강사 패닉 | 「⏸ AI 멈춤」 → 모든 AI 요청 거절 + 전원 notice | `server/src/socket.ts:137-146` |
| API 키 | MiniMax/Stability 키 N개 라운드로빈, 실패 시 다음 키 폴백 | `server/src/ai/minimax.ts:13-19,63-74` |
| 플랜 | free(덱 3개)/premium(월 9,900원)/org(무제한). **참가자 수·세션 수 제한은 플랜에 없음** | `server/src/billing/plans.ts`, `server/src/billing/gate.ts` |

---

## 2. 기술 점검

### 2.1 아키텍처 요약

```
브라우저(참가자/강사/프로젝터)
   │  HTTP(REST: 덱·AI·리포트·업로드)  +  WebSocket(socket.io, polling 폴백)
   ▼
Cloudflare 프록시 → Caddy(reverse_proxy) → docker 컨테이너 1개 (Node 22, tsx로 TS 직접 실행)
   │  Fastify 5 + socket.io 4.8 (기본 in-memory adapter)
   │  ClassroomState: Map<token, ClassroomState>  ← 모든 라이브 상태
   ▼
Supabase(PostgREST, service_role) ── best-effort 기록 (실패해도 진행)
MiniMax / Stability ── 외부 AI API
```

- 컨테이너 1개, 프로세스 1개, 클러스터·Redis 어댑터 없음 (`deploy/DEPLOYMENT.md` 표, `server/src/index.ts:76-79`).
- socket.io 옵션은 `cors` 만 지정. `maxHttpBufferSize`(기본 1MB), `pingTimeout`(기본 20s), `pingInterval`(25s) 등은 기본값 (`server/src/index.ts:76-78`; 기본값 출처: https://socket.io/docs/v4/server-options/).
- 서버 재시작 = 모든 강의실 소멸. 강사 화면에 "서버 업데이트로 강의실이 만료됐을 수 있어요" 배너가 이를 전제한다 (`client/src/pages/Instructor.tsx:268-276`). 참가자는 재입장 시 sessionId를 보내지만 서버 Map이 비어 있어 새 참가자(점수 0)로 생성된다 (`server/src/state.ts:67`).
- 트랜스포트는 `['websocket','polling']` 순으로 websocket 우선 (`client/src/lib/socket.ts:10`).

### 2.2 브로드캐스트 구조 (이벤트별 비용)

방(room) = `classroom.id`. 참가자·강사·프로젝터가 모두 같은 방에 있어 **모든 브로드캐스트가 전원에게 간다**.

| 트리거 | 발생 빈도 | 브로드캐스트 | 페이로드 크기 | 400명 기준 총 메시지 | 근거 |
|---|---|---|---|---|---|
| 참가자 입장 | 입장마다 | `participants {count}` → 전원 | ~20B | 400 × 400 = **160,000** | `server/src/socket.ts:57` |
| 슬라이드 이동 | 강사 조작 | `slide:changed` + `state` (2개) | ~150B | 800 / 회 | `socket.ts:77-78` |
| 퀴즈 응답 | 응답마다 | `quiz:answered {count}` → 전원 | ~20B | 400 × 400 = **160,000** / 문항 | `socket.ts:155` |
| 투표(wordcloud) | 표마다 | `poll:update {counts, total, entries[]}` → 전원. entries는 **전원의 닉네임+값** | 표 수 n에 비례: 400명 시 ≈ 400 × ~35B ≈ **14KB** | 400 × 400 = 160,000건, 누적 전송량 Σ(n×35B×400) ≈ **1.1GB** / 투표 1회 | `server/src/state.ts:227-237`, `socket.ts:170` |
| 정답 공개 | 문항마다 | `quiz:reveal` (분포 + **리더보드 100명**) + `leaderboard` + `state` | ~3KB | 1,200 / 문항 | `socket.ts:117-119` |
| 익명 질문 | 질문마다 | `question:new` → 전원(참가자 포함, 화면에 쓰이지 않음) | ~100B | 질문 수 × 400 | `socket.ts:197` |

계산 근거: 각 `emit`은 방 소켓 수만큼 개별 프레임으로 직렬화·전송된다(socket.io in-memory adapter 동작, https://socket.io/docs/v4/rooms/). 서버는 브로드캐스트 전 `pollDistribution()` 을 매번 O(n) 으로 재계산하며(캐시 없음), 스로틀·디바운스·차등(diff) 전송이 없다.

### 2.3 상태 저장: 메모리 vs DB

| 데이터 | 메모리 | DB 기록 시점 | 서버 재시작 후 | 근거 |
|---|---|---|---|---|
| 강의실(token, secret, 진행 슬라이드, 상태) | `byToken`/`byId` Map | 생성 시 insert, 슬라이드 이동 시 update (비동기, 미대기) | **복원 로직 없음** — 토큰 무효 | `server/src/state.ts:291-307`, `persist.ts:6-28` |
| 참가자 | `participants` Map | 입장 시 upsert(**await**), 점수 변동 시 update | 소멸 | `socket.ts:52`, `persist.ts:30-46` |
| 퀴즈 응답/투표/AI 사용/랩 | Map / 카운터 | 발생 시 insert (미대기) | 소멸(리포트는 DB에서 재구성 가능) | `persist.ts:48-87` |
| 익명 질문 | 배열 200개 | **기록 안 함** | 소멸 | `state.ts:240-244` |
| 덱 | `registry` Map (내장 1 + DB에서 lazy 로드) | 저장 시 update | DB에서 재로드 가능 | `server/src/decks/registry.ts` |

### 2.4 400명 동접 병목 후보

#### (A) 입장 스파이크 — 강연 시작 5분에 400명이 QR 스캔

| 경로 | 병목 | 근거 |
|---|---|---|
| `GET /api/classrooms/:token` | 메모리 조회, 가벼움 | `routes.ts:79-84` |
| `GET /api/decks/:id` | 참가자 전원이 **정답 제거된 덱 JSON 전체**를 받음. `toPublicDeck()` 을 요청마다 재계산(캐시 없음). 200 슬라이드 덱이면 수십 KB × 400 | `routes.ts:87-92`, `decks/index.ts:11-33`, `client/src/pages/Student.tsx:27-30` |
| `student:join` | 핸들러가 `await persistParticipant()` 로 **Supabase 왕복을 기다린 뒤** `joined` 를 보낸다. PostgREST 지연이 300ms면 400명 직렬 아님(비동기 병렬)이지만 DB 커넥션·PostgREST 처리량이 즉시 한계. DB 실패 시 `dbSafe` 가 null 반환하고 진행은 되므로 데이터 손실만 발생 | `socket.ts:41-58`, `db.ts:26-34` |
| `participants` 브로드캐스트 | 입장 1건당 400 프레임 → 400명 입장 시 16만 프레임이 30초~수분 안에 집중 | `socket.ts:57` |
| PDF 덱 | 입장 직후 슬라이드 렌더를 위해 **각 참가자가 원본 PDF 전체를 다운로드** (아래 C) | `SlideView.tsx:74` |
| Cloudflare 프록시 | 무료/기본 플랜 WebSocket은 지원하나 동시 연결 상한·100초 유휴 타임아웃 존재 (https://developers.cloudflare.com/network/websockets/) | `deploy/DEPLOYMENT.md` |

#### (B) 제출 브로드캐스트 비용 — 워드클라우드 투표가 최악

- 1표마다 전원에게 전원의 답이 담긴 배열을 재전송한다. 참가자 400명이 30초 안에 답하면 서버 송신 ≈ 1.1GB, 참가자 폰 1대가 수신 ≈ 2.8MB (400건 × 평균 7KB). LTE 환경에서 지연·배터리 문제로 이어지고, 롤링페이퍼는 매 수신마다 400개 DOM 노드를 재배치한다 (`client/src/components/PollView.tsx:26-57`).
- 퀴즈 응답 카운트도 1표 = 400 프레임. 강사·프로젝터만 필요한 정보인데 참가자에게도 간다 (`socket.ts:155`).
- 리더보드는 상위 100명 배열을 매 공개마다 전원에게 보낸다. 참가자 화면은 그중 "내 점수"만 쓴다 (`client/src/pages/Student.tsx:32-33`).

#### (C) PDF 전송

- 서버: `readFileSync` 로 파일 전체를 메모리에 올려 응답, 스트리밍·Range·ETag·Cache-Control 없음(이미지만 1일 캐시) (`routes.ts:331-349`).
- 클라이언트: 참가자마다 `pdfjsLib.getDocument(pdfUrl)` 로 **전체 PDF** 를 받는다. 페이지를 바꿀 때마다 `useEffect([pdfUrl, pageNumber])` 가 다시 실행되어 `getDocument` 를 **다시 호출**한다(pdf.js 내부 캐시가 있어도 HTTP 캐시 헤더가 없으면 재요청 가능) (`SlideView.tsx:56-130`).
- 30MB 강연 PDF × 400명 = 12GB 이그레스가 입장 시점에 몰린다. 게다가 pdf.js 워커도 cdnjs에서 로드하므로 사내망(외부 CDN 차단)에서는 슬라이드가 아예 안 뜬다 (`SlideView.tsx:71`, `client/index.html:6`).
- 참가자는 슬라이드를 폰 화면에서 보지 않아도 되는 강당 환경에서는 이 다운로드 자체가 불필요한 비용이다.

#### (D) 단일 프로세스·메모리 상태

- Node 이벤트 루프 하나가 400 소켓의 직렬화 + AI 프록시 + PDF 응답을 모두 처리. `tsx` 로 TS를 런타임 트랜스파일해 실행 중 (`server/package.json:8`).
- 수평 확장 시 socket.io 기본 어댑터로는 프로세스 간 방 공유가 안 되고, `ClassroomState` 도 공유되지 않으므로 스케일 아웃 자체가 불가.

### 2.5 익명 참여 시 수집되는 개인정보

| 항목 | 저장 위치 | 보존 | 근거 |
|---|---|---|---|
| 닉네임(자유 입력 12자, 실명 가능) | 메모리 + `axedu_participants.nickname`, 리포트·롤링페이퍼·리더보드에 노출 | 명시적 삭제 로직 없음(README는 `expires_at` 만료를 언급하나 코드에 만료 처리 없음) | `persist.ts:34`, `README.md:90` |
| sessionId (브라우저 localStorage UUID) | `axedu_participants.session_id` | 기기 식별자 역할, 브라우저 지우기 전까지 유지 | `client/src/lib/session.ts:21-28` |
| 퀴즈 응답·응답시간·점수 | `axedu_quiz_responses`, `axedu_participants.score` | 리포트에 학생별 노출 | `persist.ts:48-58` |
| 투표 값(자유 텍스트) | `axedu_poll_responses` + 롤링페이퍼에 닉네임과 함께 전원에게 실시간 공개 | — | `persist.ts:60-66`, `state.ts:234` |
| AI 입력 원문 | **랩 활동은 입력·출력 원문 저장**(`axedu_lab_runs`), 나머지 AI 활동은 건수·비용만. 단 채팅 원문은 MiniMax(중국계 API)로 전송됨 | 리포트 비교실습 탭에 원문 노출 | `persist.ts:78-87`, `routes.ts:207` |
| 익명 질문 | 메모리만, 닉네임 미기록 | 서버 재시작 시 소멸 | `state.ts:240-244` |
| IP·UA | Fastify 기본 로거(info) stdout | docker 로그 | `server/src/index.ts:28` |

동의 화면·개인정보 처리방침 링크·닉네임 익명화 옵션·세션 종료 후 삭제 버튼이 모두 없다. 롤링페이퍼는 자유 텍스트를 닉네임과 함께 전원 화면에 뿌리므로 성인 강연에서도 오남용 시 즉시 노출된다.

### 2.6 Rate limit / 쿼터 현황

| 계층 | 현재 | 문제 |
|---|---|---|
| HTTP | `@fastify/rate-limit` 등 미설치, 미들웨어 없음 | `POST /api/classrooms`(강의실 생성), `/api/decks/upload-pdf`(50MB) 를 비로그인/로그인 사용자가 무제한 호출 가능. `/api/uploads/:filename` 은 파일명만 알면 누구나 |
| Socket | 이벤트당 검증 없음 | `student:pollVote` 를 초당 수백 번 emit 하면 매번 O(n) 재계산 + 전원 브로드캐스트 → **참가자 1명이 방 전체를 DoS** 가능. `student:askQuestion` 도 무제한 |
| AI | 1인 활동별 8/4회, 강의실 15 USD | 카운트는 성공 후 증가라 실패·타임아웃 요청은 무제한. 활동 ID를 바꿔 보내면 초기화(서버가 activityId 가 덱에 있는지 chat 라우트에선 검증 안 함: `routes.ts:113-117` 은 없으면 기본 프롬프트로 진행) |
| 업로드 | 본문 50MB, 이미지 100장 | 디스크 사용량 상한·사용자별 총량 없음 |

---

## 3. 대규모 강당(일반인·직장인 400명) 관점 결핍 목록

| # | 결핍 | 현재 상태 | 왜 강당에서 문제인가 | 근거 |
|---|---|---|---|---|
| 1 | **참가자 슬라이드 미러링 강제** | `/play` 는 활동이 없으면 항상 현재 슬라이드를 렌더(PDF면 전체 다운로드) | 강당은 큰 스크린이 있으니 폰에는 "지금 할 일"만 있어야 함. 데이터·배터리 낭비 | `Student.tsx:124-131` |
| 2 | **QR 상시 노출 없음** | QR은 강사 콘솔 모달에만. 프로젝터 화면에 코드/QR 오버레이 없음 | 늦게 온 사람·앞 화면만 보는 사람이 입장 경로를 모름 | `Instructor.tsx:506-530`, `Projector.tsx` |
| 3 | **강사 재접속 불가** | 자격 미저장, 새로고침 = 새 강의실 | 노트북 절전·브라우저 크래시 시 400명이 재입장해야 함 | `Instructor.tsx:16-22` |
| 4 | **서버 재시작 = 세션 소멸** | 메모리 전용, 복원 없음 | 배포·크래시 한 번이면 강연 중단 | `state.ts:291-307` |
| 5 | **Q&A 운영 기능 부재** | 익명 텍스트 목록만. 공감·답변완료·프로젝터 표시·정렬·모더레이션 없음 | 400명 질문은 큐레이션 없이는 못 씀 | `state.ts:239-249` |
| 6 | **Q&A가 참가자 전원에게 브로드캐스트** | `question:new` 가 방 전체로 감 | 참가자 화면에는 안 쓰이는데 트래픽만 발생, 향후 공개 시 모더레이션 없이 노출 | `socket.ts:197` |
| 7 | **성인용 톤·카피 없음** | "학생", "선생님께 질문하기", "친구들의 응답", 고등학생 시스템 프롬프트 | 직장인 대상 신뢰도 저하 | `Join.tsx:39-40`, `Student.tsx:68,77`, `routes.ts:117`, `ai/lab.ts:5` |
| 8 | **워드클라우드 전송 구조** | 매 표마다 전원 목록 재전송 | 400명이면 GB 단위 이그레스, 폰 렌더 폭주 | `state.ts:227-237` |
| 9 | **투표 결과의 개인 식별** | 롤링페이퍼가 닉네임 서명을 강제 표시 | 직장 내 강연에서 상사·동료 앞 익명성 보장 안 됨 | `PollView.tsx:50-52` |
| 10 | **동명이인 처리** | 리더보드·내 점수가 닉네임 문자열 기준 | 400명 중 "김민수" 3명은 확실히 나옴 | `Student.tsx:32-33` |
| 11 | **활동 종류가 개인 AI 실습 편중** | 9종 중 7종이 개인 화면 전용 AI 채팅. 다중선택·척도(1~5)·순위·O/X·짧은 주관식(모두 보기)·이미지 투표·설문 없음 | 강당에서 쓰는 건 poll·quiz·Q&A. 나머지는 스크린에 아무것도 안 보임 | `shared/types.ts:29-137` |
| 12 | **퀴즈 정답 공개가 강사 수동** | 시간이 끝나도 자동 공개 없음(강사 버튼/Space) | 강사가 발표에 집중하면 타이밍 놓침. 자동 진행 옵션 필요 | `state.ts:134-154`, `Instructor.tsx:241-262` |
| 13 | **참가자 수 = 누적 수** | 퇴장 반영 없음 | "지금 몇 명 보고 있나" 를 모름 | `state.ts:82-84` |
| 14 | **PDF 캐시·CDN 부재 + 외부 CDN 의존** | pdf.js를 cdnjs에서 로드, 업로드 파일 캐시 헤더 없음 | 기업 사내망(외부 CDN 차단)에서 슬라이드 미표시. 400명 동시 PDF 다운로드 | `client/index.html:6`, `routes.ts:331-349` |
| 15 | **리포트 내보내기·공유 없음** | 인쇄 CSS만 | 강연 후 주최사에 결과 전달(CSV/PDF/링크) 불가 | `Report.tsx:144` |
| 16 | **참가자 사후 자료 없음** | 세션 종료 후 참가자에게 남는 것 없음 | 강연 자료·내 결과·연락처 수집(리드) 기능 부재 | `Student.tsx` |
| 17 | **rate limit 없음** | HTTP·socket 모두 | 400명 중 1명의 장난/버그로 방 전체 마비 | 2.6 |
| 18 | **개인정보 동의·보존정책 없음** | 닉네임·자유텍스트 무기한 저장, MiniMax로 원문 전송 | 기업 고객 도입 시 법무 검토 통과 불가 | 2.5 |
| 19 | **프로젝터가 투표·퀴즈 외 활동에서 슬라이드만 표시** | AI 활동 중 프로젝터는 슬라이드 고정 | 실습 결과 공유·전시가 불가능 → 참여 동기 약함 | `Projector.tsx:146-152` |
| 20 | **모바일 세로 화면 최적화 미검증** | 퀴즈 보기가 `sm:` 이상에서 2열, 워드클라우드 캔버스 폭 고정 | 강당은 100% 폰 세로. 별도 점검 필요 | `QuizStudent.tsx:85`, `PollView.tsx:69` |

---

## 4. 기술 리스크 Top 3 (근거 코드 위치)

### 리스크 1 — 워드클라우드/객관식 투표의 O(n²) 브로드캐스트

- **위치**: `server/src/socket.ts:165-173` (`student:pollVote` → `io.to(c.id).emit('poll:update', …)`), `server/src/state.ts:227-237` (`pollDistribution` 이 매번 전원 `entries` 생성).
- **시나리오**: 400명이 30초 안에 한 단어씩 제출 → 160,000 프레임, 평균 7KB → 서버 송신 ≈ 1.1GB, 참가자 1인 수신 ≈ 2.8MB. 단일 이벤트 루프가 400회 × 400건 직렬화. socket.io는 방 브로드캐스트 시 한 번 인코딩한 패킷을 소켓별로 write 하지만, `pollDistribution()` 호출과 JSON 직렬화는 표마다 반복된다.
- **완화 방향**: (1) 서버 측 200~500ms 디바운스 후 1회 브로드캐스트, (2) 참가자에게는 `counts`만, `entries`는 프로젝터·강사 룸에만(역할별 room 분리), (3) 증분(diff) 전송, (4) 참가자당 투표 rate limit.

### 리스크 2 — 라이브 상태가 단일 프로세스 메모리에만 존재

- **위치**: `server/src/state.ts:291-307` (`byToken`/`byId` Map), `server/src/index.ts:76-79` (기본 어댑터, 클러스터 없음), `client/src/pages/Instructor.tsx:16-22,268-276` (강사 자격 미저장 + 만료 배너), `deploy/DEPLOYMENT.md` (컨테이너 1개).
- **시나리오**: 강연 중 배포·OOM·크래시 1회 → 400명 토큰 무효, 강사도 재생성 외 방법 없음. 400 소켓 + PDF 응답 + AI 프록시가 한 이벤트 루프를 공유해 지연이 상호 전파됨. 수평 확장 시 방·상태 공유가 안 돼 2번째 인스턴스를 띄울 수 없음.
- **완화 방향**: Redis(또는 Postgres) 로 `ClassroomState` 스냅샷 주기 저장 + 부팅 시 복원, `@socket.io/redis-adapter` 도입, 강사 자격을 로그인 계정에 귀속해 재접속 허용, 참가자 재입장 시 DB `session_id` 로 점수 복원.

### 리스크 3 — PDF 슬라이드 전송 경로 (전량 다운로드 × 참가자 수, 캐시·CDN 부재)

- **위치**: `client/src/components/SlideView.tsx:56-130` (참가자마다 `getDocument(pdfUrl)`, 페이지 변경 시 effect 재실행), `server/src/routes.ts:331-349` (`readFileSync` 전량 응답, PDF에 캐시 헤더 없음), `client/index.html:6` + `SlideView.tsx:71` (pdf.js 본체·워커를 cdnjs에서 로드).
- **시나리오**: 30MB PDF × 400명 = 12GB 이그레스가 입장 5분에 집중, 서버 메모리에 30MB 버퍼가 동시 수백 개. 기업 사내망에서 cdnjs 차단 시 슬라이드 자체가 렌더되지 않음. 참가자 폰은 실제로 슬라이드를 볼 필요가 없는데도 이 비용을 치름.
- **완화 방향**: 업로드 시 서버에서 페이지별 이미지(webp) 사전 렌더 → 이미지 슬라이드로 변환, 업로드 파일에 `Cache-Control: immutable` + ETag + Range 지원 또는 오브젝트 스토리지/CDN, 참가자 화면은 기본적으로 슬라이드 미표시("스크린을 보세요") 옵션, pdf.js 자체 호스팅.

(보조 리스크) rate limit 부재로 참가자 1명이 `student:pollVote`/`student:askQuestion` 을 무한 emit 하면 리스크 1이 의도적으로 재현된다 (`server/src/socket.ts:165-198`, 검증 코드 없음).

---

## 5. 결론 — axedu 시사점 5줄

1. **강당 모드를 별도 프로파일로**: 참가자 화면에서 슬라이드 미러링을 끄고 "지금 할 일(투표/퀴즈/질문)"만 띄우며, 프로젝터에 QR·코드를 상시 오버레이하는 것이 최우선 UX 변경이다 (`Student.tsx:124-131`, `Projector.tsx`).
2. **브로드캐스트를 역할별 room + 디바운스로 재설계**: 참가자에겐 집계값만, 강사·프로젝터에겐 상세를, 200~500ms 묶음 전송으로 바꾸면 400명 워드클라우드가 GB에서 수 MB로 내려온다 (`socket.ts:165-173`).
3. **상태 영속화 + 강사 재접속**: Redis 스냅샷·socket.io Redis 어댑터·강사 계정 귀속으로 "재시작하면 강연 끝" 리스크를 제거해야 유료 B2B 강연에 팔 수 있다 (`state.ts:291-307`).
4. **활동 포트폴리오를 청중 참여형으로 재편**: 현재 9종 중 스크린에 무언가 보이는 건 quiz·poll뿐이다. 다중선택·척도·순위·O/X·짧은 주관식 벽·Q&A 공감/답변완료 같은 강당용 활동과, AI 결과를 익명으로 스크린에 전시하는 "쇼케이스" 뷰가 필요하다.
5. **성인·기업 대상 신뢰 요건**: 카피 톤(학생/선생님), 개인정보 동의·보존기간·익명 옵션, rate limit, PDF 캐시/자체 호스팅(사내망), 리포트 CSV/PDF 내보내기를 갖춰야 기업 교육·컨퍼런스 도입 검토를 통과한다 (2.5, 2.6, `Report.tsx:144`).

---

### 부록 A. 소켓 이벤트 전체 목록

| 방향 | 이벤트 | 발신 조건 | 수신 범위 | 근거 |
|---|---|---|---|---|
| S→C | `state` | 입장, 슬라이드 이동, 활동 열기/닫기, 퀴즈 상태 변경, 패닉 | 방 전체 / 입장자 | `socket.ts:19` |
| S→C | `slide:changed` | 강사 이동 | 방 전체 | `socket.ts:77` |
| S→C | `activity:opened` / `activity:closed` | 강사 | 방 전체 | `socket.ts:89,98` |
| S→C | `quiz:question` / `quiz:reveal` / `quiz:answered` | 강사 시작·공개 / 학생 응답 | 방 전체 | `socket.ts:108,117,155` |
| S→C | `leaderboard` | 공개, 퀴즈 종료, 역할극 클리어 | 방 전체 | `socket.ts:20` |
| S→C | `participants` | 입장·퇴장 | 방 전체 | `socket.ts:21-22` |
| S→C | `poll:update` | 활동 열기, 투표, 늦은 입장 | 방 전체 / 입장자 | `socket.ts:91,170,217` |
| S→C | `notice` | 패닉, 퀴즈 종료 | 방 전체 | `socket.ts:131,141` |
| S→C | `joined` / `errmsg` | 입장 결과 | 본인 | `socket.ts:54,28` |
| S→C | `question:new` / `questions:sync` | 질문 제출 / 강사 입장 | 방 전체 / 강사 | `socket.ts:197,37` |
| C→S | `instructor:join`, `student:join`, `viewer:join` | — | — | `shared/types.ts:227-239` |
| C→S | `instructor:goto/openActivity/closeActivity/quizStart/quizNext/quizReveal/panic` | role=instructor 검사 | — | `socket.ts:207-210` |
| C→S | `student:quizAnswer/pollVote/roleplayClear/askQuestion` | token·sessionId 존재만 검사(askQuestion은 sessionId 불요 → 프로젝터 뷰어도 질문 가능) | — | `socket.ts:149-198` |

### 부록 B. 참고 URL

- socket.io 서버 옵션 기본값(maxHttpBufferSize 1MB, pingTimeout 20s, pingInterval 25s): https://socket.io/docs/v4/server-options/
- socket.io rooms 브로드캐스트 동작: https://socket.io/docs/v4/rooms/
- socket.io Redis 어댑터(멀티 프로세스): https://socket.io/docs/v4/redis-adapter/
- Cloudflare WebSocket 제약: https://developers.cloudflare.com/network/websockets/
- pdf.js 3.11.174 (사용 중 버전): https://cdnjs.com/libraries/pdf.js/3.11.174
- Fastify rate limit 플러그인(미도입): https://github.com/fastify/fastify-rate-limit
- 내부 문서: `deploy/DEPLOYMENT.md`(인프라), `README.md` §6-7(안전·DB), `docs/adding-activities.md`(활동 레지스트리)
