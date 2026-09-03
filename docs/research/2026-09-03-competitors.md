# 경쟁 서비스 기능 전수 조사 — 대규모 청중 실시간 참여 도구

- 조사일: 2026-09-03
- 조사 범위: Slido, Mentimeter, Kahoot!, Poll Everywhere, AhaSlides, Vevox, Wooclap, Pigeonhole Live(보조), 띵커벨, 클래스카드 배틀, 퀴즈앤(국내 보조)
- 방법: 각 서비스 공식 가격/기능/도움말 페이지 + 3rd-party 리뷰(2026) WebFetch/WebSearch. 가격은 USD 월 환산(연 결제 기준)이며 수시로 바뀌므로 출처 링크 우선.
- 목적: 강연(수백~수천 명) 실시간 참여 기능의 표준 스펙과 무료/유료 경계를 파악해 우리 제품 기능 우선순위에 반영.

---

## 1. 기능 매트릭스 (서비스 × 기능)

범례: ✅ 지원 · 🟡 부분/유료 한정 · ❌ 미지원/미확인

### 1-1. 투표·의견 수집

| 기능 | Slido | Mentimeter | Kahoot! 360 | Poll Everywhere | AhaSlides | Vevox | Wooclap | Pigeonhole | 띵커벨 | 클래스카드 배틀 | 퀴즈앤 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 객관식(단일/복수) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅(투표·선택형) | ❌(퀴즈 전용) | ✅ |
| 척도(Rating/Likert/NPS) | ✅ Rating 1–10, 별/이모지 | ✅ Scales, 2×2 grid | 🟡 Slider/Scale/NPS (Plus↑) | ✅ Likert, Radar | ✅ Rating scale | ✅ Rating, Numeric, XY plot | ✅ Rating, Framework | ✅ | ✅ 가치수직선·신호등 | ❌ | 🟡 |
| 순위(Ranking) | ✅ | ✅ Ranking, 100 points | 🟡 Puzzle(정답형) | ✅ Ranking/Upvote | ✅ Correct order | ✅ Ranking | ✅ Sorting, Prioritisation | ✅ | 🟡 순서형(정답형) | ❌ | 🟡 |
| 오픈텍스트 | ✅ 10,000자, 이모지 리액션 | ✅ 250자 | 🟡 Open-ended(Plus↑) | ✅ | ✅ Open-ended | ✅ Text | ✅ Open question | ✅ | ✅ 서술형·띵킹보드 | ❌ | ✅ 보드 |
| 워드클라우드 | ✅ | ✅ | 🟡 Plus↑ | ✅ | ✅ | 🟡 Starter↑(유료) | ✅ | ✅ | ✅ | ❌ | 🟡 |
| 이미지 기반(핀/클릭/라벨) | 🟡 이미지 선택지 | ✅ Pin on image | 🟡 Pin/Drop pin(Plus↑) | ✅ Clickable image | ❌ | ✅ Pin on image | ✅ Find/Label on image | ❌ | ❌ | ❌ | ❌ |
| 브레인스토밍/아이디어 보드 | ✅ Ideas(AI 그룹핑) | 🟡 Open-ended 그리드 | 🟡 Brainstorm(Plus↑) | 🟡 Q&A 활용 | ✅ Brainstorm | ❌ | ✅ Brainstorming | ❌ | ✅ 띵킹보드 | ❌ | ✅ Board |
| 다문항 설문(Survey) | ✅ 유료 무제한 | ✅ Audience-pace(Survey mode), Quick Form(Pro) | 🟡 NPS survey(Event Plus↑) | ✅ Survey | 🟡 self-paced | 🟡 Starter↑ | ✅ Self-paced(Basic↑) | ✅ | 🟡 과제 모드 | ❌ | ✅ Mission |

### 1-2. 퀴즈·게임

| 기능 | Slido | Mentimeter | Kahoot! 360 | Poll Everywhere | AhaSlides | Vevox | Wooclap | Pigeonhole | 띵커벨 | 클래스카드 배틀 | 퀴즈앤 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 퀴즈(정답형) | ✅ 타이머+리더보드 | ✅ Select/Type answer, 2,000명 상한 | ✅ Quiz/T-F/Type/Puzzle/Slider/Pin | ✅ Competitions | ✅ 5종(Pick/Short/Match/Order/Categorise) | ✅ | ✅ MCQ/Matching/Fill/Sorting | ✅ | ✅ 9종(OX·선택·단답·빈칸·서술·순서·선잇기·투표·설명형) | ✅ 단어/문장 퀴즈 | ✅ |
| 스피드 점수(빠를수록 가점) | ✅ | ✅ 옵션 | ✅ 0–2,000점, 연속정답 스트릭 | ✅ | ✅ | 🟡 Pro↑ Speed scored | ✅ | ✅ | ✅ 배틀모드(속도+정확도) | ✅ | ✅ |
| 실시간 랭킹/리더보드/포디움 | ✅ | ✅ 문항별 갱신 | ✅ 문항별 스코어보드+최종 Top3 포디움, 토너먼트 리더보드 | ✅ 애니메이션 리더보드 | ✅ 자동 리더보드 슬라이드 | ✅ | ✅ | ✅ | ✅ 실시간 순위(레이스형) | ✅ 실시간 점수 | ✅ |
| 팀전 | ❌ | 🟡 그룹 점수 | ✅ Team mode | ❌ | ✅ Team play | ❌ | 🟡 | ❌ | 🟡 모둠 | ✅ 협동 점수 | 🟡 |
| 스피너 휠/랜덤 추첨 | ❌ | ❌ | ❌ | ❌ | ✅ Spinner wheel | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 1-3. Q&A·리액션·시각화·발표

| 기능 | Slido | Mentimeter | Kahoot! 360 | Poll Everywhere | AhaSlides | Vevox | Wooclap | Pigeonhole | 띵커벨 | 클래스카드 배틀 | 퀴즈앤 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Q&A 익명 | ✅ | ✅ | 🟡 Standard↑ | ✅ | ✅ | 🟡 Pro↑ | ✅ Message wall | ✅ | ❌ | ❌ | ❌ |
| Q&A 업보트 | ✅ | ✅ | 🟡 | ✅ 업/다운보트 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Q&A 모더레이션(사전 검열·라벨·아카이브) | 🟡 Professional↑ | 🟡 Pro↑ | 🟡 Event Plus "coming soon" | 🟡 | 🟡 유료 | 🟡 Pro↑ | 🟡 Pro↑ Moderator mode | ✅ | ❌ | ❌ | ❌ |
| 이모지 리액션(슬라이드 단위) | 🟡 오픈텍스트 응답·Ideas에 리액션, 별도 슬라이드 리액션 없음 | ✅ 👍👎❤️❓🐱 5종 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ 커스텀 이모지, 화면 플로팅 | ❌ | ❌ | ❌ |
| 결과 시각화 | 막대·도넛·워드클라우드·랭킹 | 막대·도넛·파이·산점(2×2)·워드클라우드 | 막대·워드클라우드·스코어보드 | 막대·도넛·레이더·워드클라우드 | 막대·도넛·파이·워드클라우드 | 막대·XY 산점·넘버클라우드 | 막대·워드클라우드·이미지 히트맵 | 막대·워드클라우드 | 막대·워드클라우드·출석부형 | 점수판 | 막대·워드클라우드 |
| 발표자 뷰/리모컨 | ✅ Present mode + PPT 제어바 | ✅ Presentation view + Mentimote(폰 리모컨), Presenter pace/Audience pace | ✅ 호스트 화면, Classic/Professional 호스팅 모드 | ✅ Presenter 화면 | ✅ Presenter view | ✅ Present View | ✅ Presenter view | ✅ Presenter/Projector view | ✅ 교사 화면·학생 화면 분리 | ✅ 교사 PC·학생 폰 | ✅ |
| PPT/Google Slides 연동 | ✅ PPT add-in, Google Slides, Teams/Webex/Zoom | ✅ PPT import(Basic↑), PPT/Slides/Miro 임베드(Pro) | ✅ PPT integration 전 플랜, Slides sync(Standard↑) | ✅ PPT/Keynote/Google Slides 전 플랜 | ✅ PPT import/integration | ✅ PPT add-in, Google Slides, Teams/Zoom/Webex | ✅ PPT/Slides/Teams/Zoom 전 플랜 | 🟡 | ❌ | ❌ | ❌ |
| 참여 방식 | 코드/QR/링크, 앱·로그인 불필요 | 코드/QR, 로그인 불필요 | PIN/QR, 앱 또는 웹 | 코드/SMS/링크 | 코드/QR | 코드/QR | 코드/QR | QR/링크 | 방번호+닉네임, 로그인 불필요 | 배틀 코드 | PIN/URL |
| 결과 내보내기/분석 | Excel/Sheets/PDF, Analytics(유료) | Image/PDF/Excel(Basic↑) | 리포트 다운로드(Standard↑) | 리포트(Engage↑) | 리포트(Pro) | Starter↑ | PDF/Excel(Basic↑) | PDF/Excel(Presenter↑) | Excel 결과표 | 학습 리포트 | 🟡 |

### 1-4. 수용 인원 한계 & 무료/유료 경계

| 서비스 | 무료 한도 | 첫 유료 | 대규모 상한 |
|---|---|---|---|
| Slido | 100명/이벤트, 투표 3개/이벤트, 퀴즈 1개, Q&A 무제한(모더레이션 없음) | Engage(Business) $17.50/월·200명, 투표·퀴즈·설문 무제한 | Professional 1,000명($75+$37.50/user), Enterprise 5,000명(사이트에선 10,000+ 사례) |
| Mentimeter | 월 50명 누적(30일 리셋), 거의 모든 문항 유형 | Basic $11.99/월·무제한 참가, PPT import | 퀴즈 슬라이드 2,000명 하드 리밋, 그 외 무제한(20,000명↑는 2영업일 전 사전 통보) |
| Kahoot! 360 | 10명(비즈니스 가입 3명) | Pro Start $19/월·50명 | Pro Plus 1,000 / Max 2,000 / Ultra 5,000($79/월). 1회 이벤트 $199(200명)~$799(5,000명) |
| Poll Everywhere | 40명(가입 후 30일간 700명), AI 프롬프트 10회/월 | Present $10/월·700 responses | 전 플랜 700명 상한, Educator+ $27/월 2,000명, Enterprise 커스텀 |
| AhaSlides | 50명, 퀴즈 5장+비채점 3장/프레젠테이션 | Essential $7.95/월·100명 | Pro $15.95/월 무제한 |
| Vevox | 100명, 객관식만, Q&A·워드클라우드 없음 | Starter $11.95/월·250명·워드클라우드/설문 | Pro $24.95/월 1,500명·Q&A 모더레이션·스피드 퀴즈, Enterprise 5,000명 |
| Wooclap | 참가 무제한(1,000명/이벤트), 활성 질문 5개/30일, 21종 유형 전부 | Basic(가격 비공개, 연결제) 질문 무제한·내보내기 | Pro 1,000명/이벤트·모더레이터 모드, Corporate 1,000명↑ |
| Pigeonhole Live | 100명, Q&A·투표·채팅·설문·리액션 무제한 | Presenter $13/월·250명 | Standard $150/월 2,000명, Enterprise 5,000명↑(최대 100,000명 지원 사례) |
| 띵커벨 | 일반 20명 / 인증교사 50명(수업·과제·배틀), 보드 5~10개 | 월 10,000원 / 연 75,000원(정가 120,000) | 유료 수업모드 200~500명, 워크시트 300명; 강사·교사만 결제 가능 |
| 클래스카드 배틀 | 학생 5명까지 무료(단어·용어 학습, 퀴즈배틀 포함) | Pro 기본요금+1,400원×학생 수(10명=28,000원/월) | 교실 30명 안정, 원격 70~100명 권장(공식 안내) |
| 퀴즈앤 | Basic 10명 | Pro(학교/기업별 가격) | Play 250명, Mission 2,000명 |

---

## 2. 서비스별 강점 한 줄

| 서비스 | 강점 |
|---|---|
| **Slido** | 기업 올핸즈·컨퍼런스 Q&A의 사실상 표준. 익명+업보트+모더레이션 흐름이 가장 성숙하고 Webex/Teams/PPT 통합이 깊다. 무료도 Q&A 무제한. |
| **Mentimeter** | 문항 유형 다양성(2×2 grid, Pin on image, 100 points)과 Presenter pace/Audience pace 전환. 슬라이드 리액션 이모지 내장. 무료 유형 제한 거의 없음. |
| **Kahoot!** | 게임화의 정점. 음악·스트릭·포디움·팀전으로 에너지 최고. 5,000명 이벤트 플랜과 1회성 이벤트 요금이 있어 대형 강연 단발 사용에 적합. |
| **Poll Everywhere** | 전 플랜 PPT/Keynote/Slides 네이티브 삽입 + Clickable image·Radar 등 시각화 폭. 대학 강의 시장 강자. |
| **AhaSlides** | 가성비(Pro $15.95 무제한 참가). 스피너 휠·팀 퀴즈·Match/Categorise 등 라이트 게임 요소가 풍부. |
| **Vevox** | 학술·기업 정량 폴링(Numeric, XY plot, LaTeX, 전후 비교, 인구통계 세그먼트). 무료 100명에 PPT/Teams 통합 포함. |
| **Wooclap** | 21종 질문 유형을 무료에서 전부 개방, 참가 인원 무제한(질문 수로 제한). 이미지 인터랙션(Find/Label)과 LMS 통합이 강함. |
| **Pigeonhole Live** | 대형 이벤트 특화(멀티트랙 Q&A, 등록·출입 제어, 스폰서 로고). 무료부터 리액션·채팅 포함, 5,000명↑ 퀴즈. |
| **띵커벨** | 국내 초중등 교실 표준. 로그인 없이 방번호 입장, 토론 7종(신호등·가치수직선·띵킹보드), 배틀모드 레이스형 순위, 연 75,000원의 저가. |
| **클래스카드 배틀** | 영어 단어장 기반 협동/경쟁 배틀. 100만 개 퀴즈 풀에서 골라 즉시 실행. 30명 교실에 최적화. |
| **퀴즈앤** | 국내 기업 HRD(휴넷 연동)에서 쓰이는 Play/Mission/Board 3모드, Pro 시 250명(Play)·2,000명(Mission). |

---

## 3. 대규모 강연에서 사랑받는 기능 TOP 7 (근거 포함)

순위 기준: (a) 조사 대상 11개 중 지원 서비스 수, (b) 대형 이벤트 특화 서비스(Slido·Pigeonhole·Kahoot 360 Event)가 무료/최하위 플랜에 넣는지, (c) 사용 사례·연구 근거.

1. **익명 Q&A + 업보트** — 11개 중 8개 지원, Slido·Pigeonhole은 무료에서 무제한 개방. JAM 컨퍼런스는 마이크를 Slido로 바꾼 뒤 청중 70%가 질문에 참여했고, Slido 조사에선 직장인 42%가 "하고 싶은 말을 못 하고 회의를 나간 적 있다"고 답했다. 수백 명 강연에서 마이크 돌리기의 물리적 한계를 없애는 유일한 대안이라 대형 이벤트 도구의 첫 번째 기능이다.
2. **워드클라우드** — 11개 중 10개 지원(클래스카드만 없음). Slido 도움말은 "30명 이상 청중에서 가장 잘 작동"이라 명시하고, Vevox는 이를 첫 유료 플랜의 대표 유인 기능으로 배치. 강연 오프닝 아이스브레이커로 한 단어 입력만 요구해 참여 장벽이 가장 낮고 결과가 화면에서 즉시 커진다.
3. **스피드 점수 퀴즈 + 실시간 리더보드/포디움** — 11개 중 11개 지원. Kahoot 메타분석(41개 연구·5,000명↑)에서 포인트·리더보드 도입이 학습·몰입에 크고 일관된 효과. Kahoot는 한 학기 내내 "지루해짐 없음"을 보고. 단, Mentimeter는 퀴즈만 2,000명 하드 리밋을 두고 Pigeonhole은 "5,000명↑ 퀴즈"를 차별점으로 광고할 만큼 대규모 동시 채점이 기술 병목이다.
4. **객관식 즉석 투표(막대/도넛 실시간 애니메이션)** — 전 서비스 지원, Vevox·Slido 무료 플랜의 기본. 발표 중 "손 들어보세요"를 대체하는 가장 빈번한 상호작용이며 PPT 안에서 결과 슬라이드로 바로 보여주는 것이 핵심(Poll Everywhere·Slido·Vevox가 전 플랜 PPT 연동을 제공하는 이유).
5. **앱·로그인 없는 QR/코드 입장** — 전 서비스가 채택(띵커벨 방번호+닉네임, Slido 코드/QR, Kahoot PIN). Slido와 Pigeonhole 모두 "다운로드·로그인 없이 참여"를 컨퍼런스 채택 이유 1순위로 내세운다. 강연장에선 첫 10초 안에 들어오지 못하면 참여율이 급락하므로 인원 상한보다 먼저 확인되는 요건이다.
6. **이모지 리액션(화면 플로팅)** — 아직 Mentimeter(5종 고정)·Pigeonhole(커스텀, 무료 포함)·StreamAlive만 슬라이드 단위로 지원하는 차별화 기능. Pigeonhole는 "발표자가 청중 에너지와 감정을 실시간 파악"을 Reactions의 효용으로 제시하고 세션·슬라이드별 감정 분석을 제공. 대형 강연에서 발언 없이 반응을 표현할 수 있어 가장 낮은 비용의 참여이며, Slido 커뮤니티에도 반복 요청이 올라온다.
7. **Q&A 모더레이션 + 발표자 뷰(PPT 제어바/폰 리모컨)** — 8개 서비스가 지원하나 예외 없이 유료 상위 플랜(Slido Professional, Mentimeter Pro, Vevox Pro, Wooclap Pro, Kahoot Event Plus)에 배치. 즉 대규모·공식 행사에서 실제로 돈을 내게 만드는 기능이다. 부적절 질문 사전 검열, 질문 라벨·아카이브, 발표자가 슬라이드 넘김 없이 폰(Mentimote)이나 PPT Presenter View 제어바로 투표 열고 닫기가 포함된다.

**차순위(TOP 7 밖):** 척도/NPS 설문(강연 후 만족도), 순위 투표, 다문항 Self-paced 설문, 스피너 휠(AhaSlides), 팀전(Kahoot/AhaSlides/클래스카드).

---

## 4. 우리 제품에 대한 시사점(요약)

- **무료 경계의 업계 관행**: 인원 상한(50~100명) 또는 문항 수(3~5개) 중 하나로 자른다. Wooclap·Mentimeter처럼 "유형 전부 개방 + 수량 제한"이 체험 전환에 유리하다고 각사 블로그가 주장.
- **대규모 구간의 가격 앵커**: 1,000명 ≈ $49~75/월, 2,000명 ≈ $69~150/월, 5,000명 ≈ $79~225/월 또는 1회 $799. 국내(띵커벨 연 75,000원, 500명)는 이의 1/10 수준.
- **기술 병목은 퀴즈 동시 채점**: 투표·워드클라우드는 "무제한"을 내걸지만 퀴즈는 2,000명(Mentimeter)·5,000명(Kahoot Ultra, Vevox Enterprise)에서 상한을 둔다.
- **국내 도구 공백**: 띵커벨·클래스카드·퀴즈앤 모두 교실 규모(≤500명) 설계이며 익명 Q&A 업보트·리액션·PPT 연동이 없다. 국내 대형 강연용 포지션이 비어 있다.

---

## 5. 출처

### Slido
- https://www.slido.com/product
- https://www.slido.com/features-live-qa
- https://www.wooclap.com/en/blog/slido-pricing/
- https://community.slido.com/community-q-a-7/how-many-participants-for-a-free-plan-user-7842
- https://community.slido.com/get-inspired-by-all-hands-customer-stories-105/how-jam-involved-600-participants-in-their-q-a-sessions-2295
- https://blog.slido.com/slido-features-engagement/
- https://community.slido.com/product-news-announcements-108/what-s-new-in-slido-june-2026-8336
- https://community.slido.com/community-q-a-7/does-slido-support-participants-adding-emojis-to-slides-during-a-presentation-2460
- https://community.slido.com/slido-fundamentals-205/how-to-join-slido-as-a-participant-472
- https://freesurveymakers.com/slido/

### Mentimeter
- https://www.mentimeter.com/plans
- https://help.mentimeter.com/en/articles/465589-how-many-people-can-participate-in-a-mentimeter-presentation
- https://help.mentimeter.com/en/articles/410463-how-to-create-a-quiz-competition
- https://help.mentimeter.com/en/articles/2233579-mentimote-our-presentation-remote
- https://www.mentimeter.com/blog/menti-news/live-presentation-or-survey-the-ultimate-guide-to-voting-pace
- https://educationexpress.uts.edu.au/collections/engaging-your-audience-with-mentimeter-polls/resources/question-types-in-mentimeter/
- https://www.wooclap.com/en/blog/mentimeter-review/
- https://freesurveymakers.com/mentimeter/

### Kahoot!
- https://kahoot360.com/pricing/
- https://kahoot360.com/pricing-events/
- https://support.kahoot.com/hc/en-us/articles/115002308428-Kahoot-question-types
- https://support.kahoot.com/hc/en-us/articles/42321615442707
- https://kahoot.com/blog/2026/01/14/kahoot-impact-competition-education-research/
- https://onlinelibrary.wiley.com/doi/10.1111/jcal.13084
- https://www.panquiz.com/en/blog/kahoot-pricing/

### Poll Everywhere
- https://www.polleverywhere.com/plans
- https://www.polleverywhere.com/
- https://support.polleverywhere.com/hc/en-us/articles/1260801551409-Q-A
- https://support.polleverywhere.com/hc/en-us/articles/1260801546490-Competition
- https://classhelp.screenstepslive.com/a/1869316-poll-everywhere-activity-types
- https://www.wooclap.com/en/blog/poll-everywhere-pricing/

### AhaSlides
- https://ahaslides.com/pricing/
- https://docs.ahaslides.com/price-plans/what-is-included-in-the-free-account
- https://docs.ahaslides.com/using-slide-types/how-to-make-and-run-a-quiz
- https://www.getapp.com/marketing-software/a/ahaslides/

### Vevox
- https://www.vevox.com/pricing/business-pricing
- https://www.vevox.com/features
- https://help.vevox.com/hc/en-us/sections/360002608037-Types-of-polls
- https://help.vevox.com/hc/en-us/articles/360015501218-XY-Plot

### Wooclap
- https://www.wooclap.com/en/pricing/pricing-business/
- https://docs.wooclap.com/en/articles/14402104-what-is-wooclap-s-pricing
- https://www.wooclap.com/en/questions/
- https://www.wooclap.com/en/blog/resources/guide-question-types/

### Pigeonhole Live / 리액션
- https://pigeonholelive.com/pricing/
- https://pigeonholelive.com/product/reactions/
- https://help.pigeonholelive.com/hc/en-us/articles/900005709223-Enabling-Reactions-for-interactive-sessions
- https://www.streamalive.com/features/emojis-everywhere

### 국내
- https://www.tkbell.co.kr/user/support/price.do
- https://www.tkbell.co.kr/user/support/faq/depth2.do?faqSeq=5&searchFaqSubCategorySeq=10
- https://sblog.i-scream.co.kr/thinkerbell/14450 (배틀모드, 로그인 필요)
- https://sciencelove.com/2465
- https://www.classcard.net/Home/price
- https://b.classcard.net/Home
- https://www.classcard.net/QuizEvent/877
- https://www.quizn.show/pay/payment/priceInfo.do
- https://edu.dasfl.com/entry/퀴즈앤-QuizN-매뉴얼
