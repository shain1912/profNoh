---
title: "AI/AX 교육 플랫폼 SaaS 업그레이드 리서치"
date: "2026-06-18"
mode: "standard + multi-agent"
service: "AI · AX 교육 플랫폼"
---

## Executive Summary

현재 서비스는 일반계 고등학생 대상 생성형 AI 특강을 현장에서 운영하기 위한 실시간 수업 플랫폼이다. 코드베이스상 강사는 `/teach`에서 강의실을 만들고, 학생은 코드와 닉네임으로 입장하며, 슬라이드 동기화, 퀴즈, 투표, AI 대화, 이미지 생성, 비교 랩, 역할극, 비유, 글쓰기, 힌트형 AI 튜터를 진행한다 [1][2]. 이는 단순 LMS보다 “라이브 블렌디드 수업 실행 도구”에 가깝다. 이미 잘하는 부분은 로그인 없는 학생 참여, 강사 원버튼 진행, 프로젝터 화면, 실시간 퀴즈/투표, AI 비용/쿼터 제어, PDF 기반 덱 저작, AI 강의 조교다 [1][3][4].

업그레이드 방향은 넓은 LMS로 바로 확장하기보다, 현재 강점인 “실시간 수업 + AI 실습 + 수업자료 생성”을 유지하면서 수업 전후 흐름을 닫는 것이 우선이다. 가장 빠른 제품 개선은 수업 후 리포트다. 현재 서버는 참가자, 퀴즈 응답, 투표 응답, AI 사용량, 랩 실행 기록을 이미 저장하므로, 큰 데이터 모델 변경 없이 교사용 리포트, CSV/PDF 내보내기, 다음 수업 추천, 오답 기반 복습 자료 생성을 붙일 수 있다 [4]. Nearpod도 실시간 피드백과 수업 후 리포트를 핵심 가치로 제시하고, Pear Deck은 학생 주도 모드와 실시간 응답 확인을 유료 기능으로 묶는다 [11][12].

블렌디드 러닝 관점에서 이 서비스에 가장 잘 맞는 모델은 플립러닝, 스테이션 로테이션, 개별 순환, 플렉스 모델이다. 현재 제품은 강사 주도 라이브 수업에는 강하지만, 학생별 학습 경로, 숙달 기준, 사전/사후 과제, 교사 개입 큐가 부족하다. 따라서 다음 큰 방향은 “AI 코스웨어 기반 블렌디드 수업 운영체제”다. 한국 시장 키워드는 `AI 코스웨어`, `AI 튜터`, `형성평가`, `학습 리포트`, `블렌디드 러닝`, `온오프라인 통합 수업관리`, `AI 보조교사`, `학습분석 대시보드`가 적합하다 [18][19].

## Introduction

### Scope

본 조사는 로컬 코드베이스 분석과 외부 리서치를 결합해, 현재 AI/AX 교육 플랫폼을 SaaS 제품으로 업그레이드하기 위한 전략을 정리한다. 사용자의 요청에 따라 멀티 에이전트로 코드베이스 분석, SaaS 제품개선 조사, 블렌디드 러닝 모델 조사, 키워드/포지셔닝 조사를 병렬 수행했다.

### Key Assumptions

이 보고서는 현재 서비스를 “고등학생 대상 AI/AX 특강 운영 플랫폼”에서 출발한 교육 SaaS로 본다. 단기 고객은 개별 강사와 교육기관이며, 중기 고객은 학교, 학원, 교육회사, 공공/민간 AI 교육 운영자다. 현재 코드는 완전한 범용 LMS라기보다 실시간 수업 진행과 AI 활동 저작에 최적화되어 있으므로, 추천도 범용 LMS 기능 전체가 아니라 현재 구조에서 가장 효율적으로 확장 가능한 항목에 집중한다.

## Main Analysis

### Finding 1. 현재 서비스는 라이브 AI 수업 실행력이 강하다

코드베이스 기준 서비스의 핵심은 실시간 수업 운영이다. `README.md`는 플랫폼을 “강사 동기화 슬라이드 + 핸즈온 실습 + Kahoot형 라이브 퀴즈 + 투표”로 설명하며, 로그인 없이 강의실 코드와 닉네임으로 참여하는 흐름을 강조한다 [1]. 라우팅도 `/join`, `/play`, `/teach`, `/screen/:token`, `/build`, `/build/:deckId`로 학생, 강사, 프로젝터, 저작 화면을 분리한다 [2].

강사 콘솔의 장점은 현장 진행 마찰을 낮춘 점이다. 강사는 현재 슬라이드의 활동을 열고, 퀴즈 문제를 시작하고, 정답을 공개하고, 다음 문제나 다음 슬라이드로 이동하는 과정을 “다음 단계” 버튼 중심으로 처리한다 [3]. 학생은 모바일에서 코드를 입력하고 입장하며, 프로젝터 뷰어는 참가자를 만들지 않고 읽기 전용으로 현재 상태를 본다 [5]. 늦게 들어온 학생에게 현재 열린 활동과 퀴즈 상태를 다시 보내는 로직도 있다 [5].

교육 활동 폭도 이미 넓다. 공용 타입에는 `chat`, `image`, `lab`, `quiz`, `poll`, `roleplay`, `analogy`, `writing`, `tutor`가 정의되어 있고, 서버 라우트에는 각 AI 활동 API가 구현되어 있다 [2][6]. 특히 `lab`은 같은 입력을 서로 다른 조건으로 비교하는 A/B 실험에 가깝고, 기본 AI/AX 덱은 프롬프트 표현, 컨텍스트, 하네스, AI 윤리, 진로까지 수업 흐름으로 묶는다 [7]. 이는 단순 퀴즈 도구보다 “AI 리터러시 수업 키트”로 차별화될 수 있다.

또 하나의 강점은 강사용 저작 흐름이다. `/build`는 AI 덱 생성, 빈 덱 생성, PDF 업로드, 로그인/비회원 저장 흐름을 제공하고, `/build/:deckId`에는 AI 강의 제작 조교가 있어 PDF 내용을 바탕으로 퀴즈, 투표, 역할극, 비유, 글쓰기, 튜터 활동을 추가한다 [8]. 교사 관점에서 수업자료 준비와 수업 실행이 한 제품 안에 들어온 것은 유지해야 할 핵심 가치다.

### Finding 2. 가장 빠른 SaaS 업그레이드는 수업 후 리포트다

현재 제품은 수업 중 경험이 강하지만, 수업 후 학습 증거를 다시 활용하는 흐름이 약하다. 그런데 서버는 이미 리포트에 필요한 데이터를 상당 부분 저장한다. `persist.ts`는 강의실, 참가자, 점수, 퀴즈 응답, 투표 응답, AI 사용량, 랩 실행을 Supabase에 기록한다 [4]. 따라서 첫 번째 업그레이드는 새 AI 모델이나 복잡한 LMS 통합보다 `/report` 계층을 만드는 것이 합리적이다.

수업 후 리포트는 세 가지 제품 가치를 만든다. 첫째, 교사가 “오늘 수업이 어땠는지” 바로 확인한다. 문항별 정답률, 오답 분포, 평균 응답 시간, 참여율, 워드클라우드, AI 실습 사용량, 예산 사용량을 보여줄 수 있다. 둘째, 다음 수업 준비를 자동화한다. 오답률이 높은 문항에서 보충 슬라이드, 복습 퀴즈, 쉬운 설명, 추가 AI 튜터 과제를 생성할 수 있다. 셋째, 유료화 포인트가 된다. 무료는 기본 결과만, Pro는 상세 리포트와 내보내기, School은 관리자 집계와 학급/교사 비교를 제공할 수 있다.

경쟁 제품도 같은 방향이다. Nearpod는 교사가 인터랙티브 미디어와 평가를 전달하고, 학생이 실시간 또는 자기 속도에 맞춰 상호작용하며, 교사가 실시간 피드백과 수업 후 리포트를 얻는 흐름을 제시한다 [11]. Pear Deck은 학생 주도 모드, 익명 응답 투사, 실시간 학생 응답 확인, 세션 관리와 보관을 기능으로 묶는다 [12]. Wayground는 수업, 연습, 평가를 하나의 AI 지원 허브로 묶고 상세 성과 리포트와 차별화 수업을 강조한다 [13].

따라서 추천 구현은 명확하다. `axedu_quiz_responses`, `axedu_poll_responses`, `axedu_ai_usage`, `axedu_lab_runs`, `axedu_participants`를 조인하는 서버 API를 만들고, 강사 콘솔 또는 수업 종료 후 화면에 리포트 링크를 붙인다. MVP 리포트 필드는 참가자 수, 퀴즈별 정답률, 문항별 오답 분포, 리더보드, 투표 결과, AI 사용량, 예상 비용, 안전 차단 횟수다. 다음 단계는 CSV/PDF export와 “오답 기반 복습 덱 생성”이다.

### Finding 3. 블렌디드 수업 모델은 제품 구조를 다시 잡는 좋은 프레임이다

Blended Learning Universe는 대표 모델로 Station Rotation, Lab Rotation, Individual Rotation, Flipped Classroom, Flex, A La Carte, Enriched Virtual을 제시한다 [9]. 현재 서비스는 강사 주도 라이브 수업과 활동 전환이 강하므로 플립러닝, 스테이션 로테이션, 개별 순환, 플렉스 모델을 우선 적용하는 것이 맞다.

플립러닝은 강의식 설명을 사전 온라인 학습으로 옮기고, 수업 시간에는 교사 주도 연습과 프로젝트를 하는 방식이다 [9]. 현재 제품에 맞추면 “사전 영상/PDF + 체크 퀴즈 + 수업 당일 실습 추천”으로 구현할 수 있다. 사전 학습을 완료하지 않은 학생을 표시하고, 수업 중에는 미완료 그룹을 위한 짧은 보충 활동을 자동 생성하면 된다.

스테이션 로테이션은 학생이 정해진 스케줄에 따라 여러 스테이션을 순환하고, 적어도 하나는 온라인 학습 스테이션인 모델이다 [9]. 현재 서비스의 활동 타입은 스테이션 구성에 잘 맞는다. 예를 들어 1스테이션은 교사 미니강의, 2스테이션은 AI 튜터, 3스테이션은 역할극, 4스테이션은 퀴즈/투표로 구성할 수 있다. 필요한 기능은 그룹 편성, 스테이션 타이머, 그룹별 진행 상태, 교사용 순환표다.

개별 순환은 학생별로 교사 또는 알고리즘이 정한 플레이리스트를 따라 이동하는 모델이다 [9]. 이 방향은 장기적으로 강력하지만, 데이터와 평가 기준이 필요하다. 지금 당장 전체 적응형 엔진을 만들기보다, 퀴즈 결과에 따라 “A그룹: 기초 설명, B그룹: 심화 과제, C그룹: AI 튜터 힌트”처럼 교사가 승인하는 추천 경로부터 시작하는 편이 안전하다.

플렉스 모델은 온라인 학습이 중심이고 교사가 필요할 때 지원하는 방식이다 [9]. 이 모델을 SaaS 방향으로 채택하면 제품은 라이브 수업 도구에서 “AI 튜터 + 교사 개입 큐 + 학습분석 대시보드”로 확장된다. 다만 이 경우 학습 목표, 숙달 기준, 데이터 거버넌스, 교사 개입 정책이 필요하므로 중장기 로드맵으로 두는 것이 좋다.

### Finding 4. AI 교육 제품은 교사 통제와 안전을 제품 언어로 가져가야 한다

AI 교육 정책과 연구는 일관되게 사람 중심, 교사 중심, 안전, 투명성을 강조한다. 미국 교육부 AI 보고서는 AI가 적응형 학습과 피드백 루프를 강화할 수 있지만, 교사를 시스템 설계의 중심에 두어야 하고 AI가 생성하는 부정확한 출력, 개인정보, 편향, 공정성 리스크를 관리해야 한다고 설명한다 [10][14]. UNESCO도 생성형 AI가 규제보다 빠르게 발전하면서 개인정보와 기관 검증 공백이 생긴다고 보고, 교육에서 인간 중심 접근과 연령 적합한 설계를 강조한다 [15].

현재 서비스는 이 방향과 잘 맞는 기반을 일부 갖고 있다. AI 키는 서버에만 있고, 학생 입력에는 안전 필터와 쿼터, 강의실 예산, 강사 AI 일시정지 기능이 있다 [1][6]. 하지만 코드 분석상 기존 `chat`, `image`, `lab`에는 `checkSafety`가 적용되어 있으나, `roleplay`, `analogy`, `writing`, `tutor` 같은 신규 AI 엔드포인트에는 동일한 입력 안전검사가 보이지 않는다 [6]. 미성년자 대상 서비스이므로 이 부분은 제품 확장 전에 바로 보완해야 한다.

또한 한국 AI 기본법은 2026년 1월 22일부터 시행되었고, 생성형 AI와 고영향 AI, 투명성, 안전, 사용자 보호가 시장 진입 시점부터 고려되어야 한다 [16]. 이 서비스가 당장 고영향 AI로 분류되는지는 별도 법률 검토 대상이지만, 학생 대상 생성형 AI 서비스라는 점에서 “AI 사용 고지”, “AI 생성물 표시”, “데이터 처리 설명”, “삭제/보관 정책”, “교사 승인 흐름”은 제품 신뢰의 기본값으로 가져가는 것이 좋다.

제품 카피도 “AI가 교사를 대체한다”가 아니라 “교사가 더 잘 보게 해주는 AI 보조교사”로 가야 한다. 한국 교육부의 AI 디지털교과서 정책 언어도 학생 맞춤 교육, AI 튜터링, 교사의 인간적 연결 강화, T.O.U.C.H 교사단 같은 표현을 사용한다 [18]. 따라서 제품 포지셔닝은 `AI 튜터`, `AI 보조교사`, `교사 대시보드`, `맞춤형 학습지원`, `형성평가`, `학습진단`으로 맞추는 것이 자연스럽다.

### Finding 5. 학습분석은 “보여주기”보다 “다음 행동”으로 설계해야 한다

학습분석 대시보드는 학습자의 참여, 경험, 수행 데이터를 시각화해 교사와 학생이 더 나은 결정을 하도록 돕는 시스템이다 [17]. 그러나 연구는 대시보드가 항상 효과적인 것은 아니며, 교사가 해석하고 행동할 수 있는 형태가 아니면 단순 수치 표시로 끝난다고 지적한다 [17]. 미국 교육부 보고서도 형성평가는 측정 자체가 아니라 수업과 학습을 바꾸는 피드백 루프가 될 때 의미가 있다고 설명한다 [14].

따라서 이 서비스의 대시보드는 “참여율 72%”에서 멈추면 안 된다. 교사에게 필요한 문장은 “이 문항에서 60%가 B를 골랐으니, 개념 X를 3분 미니강의로 다시 설명하세요”, “세 학생이 AI 튜터에서 같은 오류를 반복했습니다”, “다음 수업에 사용할 5문항 복습 퀴즈를 생성하시겠습니까?”에 가깝다. 현재 저장 데이터는 이 수준의 시작점으로 충분하다 [4].

대시보드 역할은 세 층으로 나누는 것이 좋다. 첫째, 강사용 실시간 대시보드는 현재 참여, 응답 수, 오답 분포, 도움 필요 학생을 보여준다. 둘째, 수업 후 리포트는 학습 증거와 다음 수업 추천을 제공한다. 셋째, 관리자 대시보드는 교사별 사용량, 수업 수, 학생 참여, AI 비용, 안전 차단, 인기 덱을 집계한다. 이 구조는 개별 강사 SaaS에서 학교/학원 B2B로 넘어갈 때 필요한 증거를 만든다.

### Finding 6. 키워드와 포지셔닝은 “AI 코스웨어 기반 블렌디드 수업 LMS”가 가장 맞다

현재 제품을 “AI 교육 플랫폼”이라고만 부르면 너무 넓다. “Kahoot형 퀴즈 도구”라고 부르면 AI 저작과 수업 운영 강점이 사라진다. “LMS”라고만 부르면 현재 라이브 수업 경험이 묻힌다. 가장 적합한 카테고리는 `AI 코스웨어 기반 블렌디드 수업 LMS` 또는 `온오프라인 통합 AI 수업 운영 솔루션`이다.

한국어 핵심 키워드는 다음과 같다. 학교/공공 시장에는 `AI 코스웨어`, `AI 디지털교과서`, `AI 튜터`, `AI 보조교사`, `맞춤형 학습`, `학습 진단`, `형성평가`, `학습분석 대시보드`가 맞다 [18][19]. 교사 생산성에는 `수업자료 제작`, `AI 강의안 생성`, `퀴즈 자동 생성`, `수업 리포트`, `오답관리`, `진도율 관리`가 맞다. 학원/교육회사에는 `학원 LMS`, `온오프라인 수업관리`, `출결관리`, `과제관리`, `학부모 알림`, `학습현황 확인`이 맞다.

영어 키워드는 `blended learning platform`, `K-12 LMS`, `classroom engagement platform`, `formative assessment`, `AI tutor`, `teacher dashboard`, `learning analytics`, `lesson authoring`, `Google Classroom alternative`, `hybrid learning platform`이 적합하다. 다만 글로벌 SEO보다 한국 시장 메시지를 먼저 맞추는 것이 현실적이다.

추천 한 줄 포지셔닝은 다음과 같다. “AI로 강의안을 만들고, 학생은 코드로 참여하며, 수업 후 리포트까지 남는 블렌디드 수업 운영 플랫폼.” 학교용으로는 “AI 코스웨어와 형성평가를 결합한 교사용 블렌디드 수업 LMS.” 학원용으로는 “온라인+오프라인 수업, 과제, 평가, 학습 리포트를 하나로 묶는 AI 수업관리 솔루션.” 

## Synthesis & Insights

### What You Are Already Doing Well

1. 현장 수업 마찰이 낮다. 학생 로그인 없이 코드와 닉네임으로 입장하고, 강사는 링크와 코드를 바로 공유한다 [1][3].
2. 실시간 수업 경험이 명확하다. 슬라이드 동기화, 퀴즈, 투표, 리더보드, 프로젝터 뷰가 있다 [2][5].
3. AI 활동이 단순 채팅을 넘는다. 이미지, 비교 랩, 역할극, 비유, 글쓰기, 힌트형 튜터까지 교육 활동으로 구조화되어 있다 [2][6].
4. 저작과 실행이 연결되어 있다. AI 덱 생성, PDF 업로드, AI 조교, 편집, 수업 시작이 한 흐름이다 [8].
5. 비용과 안전의 기본 방어선이 있다. 쿼터, 강의실 예산, 강사 일시정지, 서버 측 AI 키 보관, 콘텐츠 필터가 있다 [1][6].
6. 수업 후 리포트로 이어질 데이터가 이미 쌓인다. 참가자, 퀴즈, 투표, AI 사용량, 랩 기록 저장 함수가 있다 [4].

### Main Gaps

1. 수업 후 리포트가 없다. 이미 저장되는 데이터를 제품 가치로 돌려주지 못한다 [4].
2. 신규 AI 엔드포인트의 안전 필터 일관성이 부족하다. `roleplay`, `analogy`, `writing`, `tutor`도 입력 안전검사와 사용 로그 정책을 통일해야 한다 [6].
3. 서버 메모리 상태 의존이 크다. 진행 중 강의실 복구, 재시작 복원, 운영 안정성 측면에서 장기 SaaS 리스크가 있다 [20].
4. DDL/마이그레이션 파일이 로컬에 없다. Supabase 테이블과 RLS를 운영 지식에 의존하면 팀 확장과 배포 안정성이 떨어진다.
5. 교사/학교 판매에 필요한 신뢰 페이지가 없다. 개인정보, AI 처리, 보관/삭제, 하위처리자, 생성형 AI 표시 정책을 공개해야 한다 [15][16].
6. 학습 경로와 숙달 기준이 없다. 현재는 라이브 참여 중심이며, 플렉스/개별 순환/숙달학습으로 가려면 역량맵과 추천 경로가 필요하다 [9][17].

## Recommendations

### 0-2 Weeks: Risk Fix + Reporting MVP

1. `roleplay`, `analogy`, `writing`, `tutor` API에 `checkSafety`를 적용한다.
2. 안전 차단 로그를 남긴다. 관리자 리포트에서 차단 건수를 볼 수 있게 한다.
3. `/api/classrooms/:id/report`를 만든다.
4. 교사용 리포트 페이지를 만든다. 기본 필드는 참가자 수, 문항별 정답률, 오답 분포, 투표 결과, AI 사용량, 비용이다.
5. 수업 종료 버튼 또는 새 강의실 버튼 주변에 “리포트 보기”를 추가한다.

### 2-6 Weeks: Retention Loop

1. 리포트에서 “복습 퀴즈 생성”과 “보충 슬라이드 생성”을 제공한다.
2. 덱 복제와 템플릿 저장을 추가한다.
3. 교사 온보딩 체크리스트를 만든다. 목표는 “첫 라이브 수업 5분 내 시작”이다.
4. PDF/텍스트에서 질문 추출 기능을 강화한다. Kahoot의 문항 추출, Nearpod의 AI Create와 같은 방향이다 [11][21].
5. 무료/Pro/School의 기능 제한과 AI 크레딧 미터를 붙인다.

### 6-12 Weeks: Blended Learning Layer

1. 플립러닝 템플릿: 사전자료, 사전 체크퀴즈, 수업 중 실습, 종료 티켓.
2. 스테이션 로테이션 템플릿: 그룹, 타이머, 스테이션별 활동, 교사용 순환표.
3. 개별 보충 추천: 퀴즈 결과로 쉬운 설명/심화 과제/AI 튜터 과제를 추천하되 교사가 승인한다.
4. 학생별 리포트는 실명 개인정보 부담이 크므로, 초기에는 닉네임/세션 기준으로 최소화한다.
5. Google Classroom CSV export 또는 공유 링크부터 시작하고, 정식 add-on/LTI는 사용량 검증 후 진행한다 [22][23].

### 3-6 Months: School/Hagwon SaaS

1. 관리자 대시보드 Lite: 교사 수, 수업 수, 학생 참여, AI 사용량, 안전 차단, 인기 덱.
2. 신뢰/개인정보 페이지: 데이터 수집 항목, 보관 기간, 삭제 요청, AI 제공자, 광고 미사용, 생성형 AI 표시.
3. 학교/학원 조직 계정과 공유 템플릿.
4. 과제/복습 모드: 라이브 수업 후 학생이 자기 속도로 복습.
5. 학부모/관리자용 요약은 선택 기능으로 둔다. 미성년자 데이터 처리 부담이 커지므로 기본값은 최소 수집이다.

## Blended Learning Model Map for This Product

| Model | Korean Keywords | Fit | Product Feature |
|---|---|---:|---|
| Flipped Classroom | 플립러닝, 거꾸로 교실 | High | 사전자료 + 체크퀴즈 + 수업 중 AI 실습 |
| Station Rotation | 스테이션 순환, 순환 모델 | High | 그룹 편성, 스테이션 타이머, 활동별 진행 |
| Individual Rotation | 개별 순환 학습 | Medium | 퀴즈 결과 기반 개인별 추천 경로 |
| Flex Model | 플렉스 모델, 유연 학습 | Medium | AI 튜터 + 교사 개입 큐 + 학습분석 |
| Enriched Virtual | 강화 가상 모델 | Low-Mid | 온라인 복습 + 오프라인 체크포인트 |
| HyFlex | 하이플렉스 | Low initially | 대면/실시간온라인/비동기 동등 지원, 복잡도 높음 |
| Mastery-Based | 숙달학습, 역량기반교육 | Medium-Long | 역량맵, 숙달 기준, 재평가, 포트폴리오 |

## Keyword Bank

### Korean

`AI 코스웨어`, `AI 디지털교과서`, `AI 튜터`, `AI 보조교사`, `AI 학습관리`, `AI 맞춤학습`, `AI 평가`, `AI 자동채점`, `형성평가`, `학습 리포트`, `오답관리`, `학습분석`, `교사 대시보드`, `수업자료 제작`, `퀴즈 자동 생성`, `블렌디드 러닝`, `혼합형 수업`, `온오프라인 통합 수업관리`, `하이브리드 수업`, `플립러닝`, `거꾸로 교실`, `스테이션 순환`, `플렉스 모델`, `학원 LMS`, `학원관리 프로그램`, `출결관리`, `과제관리`, `학부모 알림`, `학습현황 확인`.

### English

`AI courseware`, `blended learning platform`, `K-12 LMS`, `classroom engagement platform`, `formative assessment`, `teacher dashboard`, `AI tutor`, `AI teaching assistant`, `learning analytics`, `lesson authoring`, `quiz generator`, `hybrid learning platform`, `Google Classroom alternative`, `student progress tracking`, `post-session reports`, `student-paced mode`.

## Prioritized Backlog

| Priority | Feature | Why Now | Effort |
|---|---|---|---|
| P0 | Safety filter consistency for all AI endpoints | Minor abuse risk, 미성년자 서비스 기본 | Low |
| P0 | Classroom report API/page | Existing data already stored, strongest retention value | Medium |
| P0 | Supabase migration files | 운영/팀 확장 안정성 | Medium |
| P1 | Report export CSV/PDF | Paid tier value, school proof | Medium |
| P1 | Remediation quiz/deck generation | AI feature with direct teacher value | Medium |
| P1 | Activation funnel events | SaaS conversion visibility | Low-Med |
| P1 | Trust/privacy page | School/hagwon sales blocker removal | Low |
| P2 | Deck duplication/template gallery | Growth loop, reuse | Medium |
| P2 | Station rotation template | Blended learning differentiation | Medium |
| P2 | Google Classroom CSV/share | Practical integration | Medium |
| P3 | Admin dashboard Lite | School plan packaging | Medium-High |
| P3 | Individual playlist/mastery engine | Long-term differentiation | High |

## Limitations & Caveats

본 조사는 코드 정적 분석, 웹 리서치, 서브에이전트 결과를 기반으로 한다. 실제 Supabase DDL/RLS 정책, 운영 키 상태, 배포 환경, 실제 교사/학생 사용 로그, 결제 전환율, 검색량 데이터는 검증하지 못했다. 키워드 우선순위는 유료 검색량 도구 기반 랭킹이 아니라 제품 적합도와 구매 의도 기준이다.

## Bibliography

[1] Local source. `README.md`. AI · AX 교육 플랫폼 설명, 스택, 수업 흐름, 안전/비용 제어. H:\profNoh\README.md.

[2] Local source. `shared/types.ts`, `client/src/App.tsx`. 활동 타입, 수업 상태, 라우팅 구조. H:\profNoh\shared\types.ts; H:\profNoh\client\src\App.tsx.

[3] Local source. `client/src/pages/Instructor.tsx`. 강사 콘솔과 원버튼 진행 UI. H:\profNoh\client\src\pages\Instructor.tsx.

[4] Local source. `server/src/persist.ts`. 강의실, 참가자, 퀴즈, 투표, AI 사용량, 랩 실행 저장. H:\profNoh\server\src\persist.ts.

[5] Local source. `server/src/socket.ts`. 실시간 이벤트, 늦은 입장자 상태 재전송, 퀴즈/투표 동기화. H:\profNoh\server\src\socket.ts.

[6] Local source. `server/src/routes.ts`, `server/src/ai/safety.ts`. AI API, 안전 필터, 덱 저작 API. H:\profNoh\server\src\routes.ts; H:\profNoh\server\src\ai\safety.ts.

[7] Local source. `server/src/decks/ai-ax-4h.ts`. 기본 AI/AX 4시간 특강 덱. H:\profNoh\server\src\decks\ai-ax-4h.ts.

[8] Local source. `client/src/pages/Build.tsx`, `client/src/pages/DeckEditor.tsx`, `server/src/ai/generateDeck.ts`. AI 덱 생성, PDF 업로드, AI 강의 조교. H:\profNoh\client\src\pages\Build.tsx; H:\profNoh\client\src\pages\DeckEditor.tsx; H:\profNoh\server\src\ai\generateDeck.ts.

[9] Blended Learning Universe / Clayton Christensen Institute. "Blended Learning Models." https://www.blendedlearning.org/models/ (Retrieved 2026-06-18).

[10] U.S. Department of Education, Office of Educational Technology (2023). "Artificial Intelligence and the Future of Teaching and Learning: Insights and Recommendations." https://www.ed.gov/sites/ed/files/documents/ai-report/ai-report.pdf (Retrieved 2026-06-18).

[11] Nearpod. "Formative Assessment Teaching Tools." https://nearpod.com/formative-assessment (Retrieved 2026-06-18).

[12] Pear Deck Learning. "Pricing." https://www.peardeck.com/pricing (Retrieved 2026-06-18).

[13] Wayground Help Center (2025). "What is Wayground?" https://help.wayground.com/support/solutions/articles/158000403991-what-is-wayground- (Retrieved 2026-06-18).

[14] U.S. Department of Education (2023). AI report sections on formative assessment and feedback loops. https://www.ed.gov/sites/ed/files/documents/ai-report/ai-report.pdf (Retrieved 2026-06-18).

[15] UNESCO (2023, updated 2026). "Guidance for generative AI in education and research." https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research (Retrieved 2026-06-18).

[16] International Trade Administration (2026). "South Korea AI Basic Act." https://www.trade.gov/market-intelligence/south-korea-ai-basic-act (Retrieved 2026-06-18).

[17] Kannan, P. and Zapata-Rivera, D. (2022). "Facilitating the Use of Data From Multiple Sources for Formative Learning..." Frontiers in Education. https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2022.913594/full (Retrieved 2026-06-18).

[18] 대한민국 정책브리핑 / 교육부 (2023). "2025년부터 수학·영어·정보교과에 AI디지털교과서 도입." https://www.korea.kr/news/policyNewsView.do?newsId=148912094 (Retrieved 2026-06-18).

[19] Subagent keyword research notes, 2026-06-18. Sources included Google Classroom, Canvas, Schoology, Seesaw, ClassDojo, Classting, ClassCard, Classum, Korean AI digital textbook materials.

[20] Local source. `server/src/state.ts`. 메모리 기반 강의실 레지스트리와 상태 관리. H:\profNoh\server\src\state.ts.

[21] Kahoot! (2025). "Kahoot! launches new AI-powered study tools for Back-to-School." https://kahoot.com/press/2025/09/22/new-ai-powered-study-tools-back-to-school/ (Retrieved 2026-06-18).

[22] Google for Developers. "Google Classroom add-ons." https://developers.google.com/workspace/classroom/add-ons (Retrieved 2026-06-18).

[23] 1EdTech. "Learning Tools Interoperability." https://www.1edtech.org/standards/lti (Retrieved 2026-06-18).

## Methodology Appendix

The research used the `deep-research` skill workflow in standard mode. The main agent inspected the local repository, especially README, shared types, routes, socket, state, persistence, deck generation, default deck, build flow, and instructor console. Four subagents were spawned: one for codebase analysis, one for SaaS product upgrade research, one for blended learning models, and one for keyword/positioning research. External web research focused on blended learning taxonomies, AI education policy, learning analytics, competitor features, Korean AI digital textbook policy, SaaS pricing/onboarding, privacy/compliance, and integrations.
