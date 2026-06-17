import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';

interface ReportData {
  classroom: {
    id: string;
    token: string;
    deckId: string;
    title: string;
    status: string;
    createdAt: string;
  };
  deckSummary: {
    id: string;
    title: string;
    slideCount: number;
  } | null;
  stats: {
    totalParticipants: number;
    totalCost: number;
    safetyBlocks: number;
    aiTypeCounts: Record<string, number>;
  };
  participants: Array<{
    id: string;
    nickname: string;
    score: number;
    joinedAt: string;
  }>;
  quizSummary: Record<
    string,
    {
      questionText: string;
      options: string[];
      correctIndex: number;
      totalAnswers: number;
      correctAnswers: number;
      correctRate: number;
      answers: Record<string, number>;
      studentDetails: Array<{
        nickname: string;
        answer: string;
        isCorrect: boolean;
        responseMs: number;
        points: number;
      }>;
    }
  >;
  pollSummary: Record<
    string,
    {
      prompt: string;
      mode: 'choice' | 'wordcloud';
      options: string[];
      totalVotes: number;
      votes: Record<string, number>;
      studentDetails: Array<{
        nickname: string;
        value: string;
      }>;
    }
  >;
  labSummary: Array<{
    nickname: string;
    labType: string;
    input: string;
    config: any;
    output: any;
    createdAt: string;
  }>;
  participantAiUsages: Array<{
    nickname: string;
    chat: number;
    image: number;
    analogy: number;
    roleplay: number;
    writing: number;
    tutor: number;
    cost: number;
  }>;
}

export default function Report() {
  const { classroomId = '' } = useParams();
  const [params] = useSearchParams();
  const secret = params.get('secret') ?? '';
  const nav = useNavigate();

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'quiz' | 'poll' | 'lab'>('overview');

  useEffect(() => {
    if (!classroomId || !secret) {
      setErr('유효하지 않은 강의실 접근 권한입니다.');
      setLoading(false);
      return;
    }

    async function loadReport() {
      try {
        const r = await apiGet<ReportData>(`/api/classrooms/${classroomId}/report?secret=${secret}`);
        setData(r);
      } catch (e: any) {
        setErr(e.message ?? '리포트를 불러오는 데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [classroomId, secret]);

  if (loading) {
    return (
      <div className="grid h-full place-items-center text-white/40 bg-[#0b0e11]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold">📊 실시간 수업 결과 데이터 집계 중…</p>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="grid h-full place-items-center text-white/60 p-6 bg-[#0b0e11]">
        <div className="card max-w-md w-full text-center space-y-4">
          <span className="text-4xl">⚠️</span>
          <h2 className="text-lg font-bold text-down">접근 권한 오류</h2>
          <p className="text-sm text-white/50">{err || '리포트 데이터를 읽을 수 없습니다.'}</p>
          <button className="btn-primary w-full py-2.5 text-sm" onClick={() => nav('/teach')}>
            강사 페이지로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const { classroom, stats, participants, quizSummary, pollSummary, labSummary, participantAiUsages } = data;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-full bg-[#0b0e11] text-body flex flex-col font-sans">
      {/* CSS print style injection */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #111111 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-full {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-card {
            background: #ffffff !important;
            color: #111111 !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            page-break-inside: avoid;
            margin-bottom: 1.5rem !important;
          }
          .print-text-dark {
            color: #111111 !important;
          }
          .print-text-muted {
            color: #4a5568 !important;
          }
          .print-section {
            display: block !important;
            page-break-before: always;
          }
          .print-progress-bar {
            background-color: #cbd5e1 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-badge-green {
            background-color: #d1fae5 !important;
            color: #065f46 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-badge-red {
            background-color: #fee2e2 !important;
            color: #991b1b !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* 헤더 */}
      <header className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 px-6 py-4 bg-white/5">
        <div>
          <span className="text-xs font-bold text-brand uppercase tracking-wider">LIVE CLASSROOM REPORT</span>
          <h1 className="text-2xl font-extrabold text-white">{classroom.title}</h1>
          <p className="text-xs text-white/50 mt-1">
            개설일자: {new Date(classroom.createdAt).toLocaleString()} | 강의실 코드: <span className="font-bold text-brand">{classroom.token}</span>
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button className="btn bg-white/5 border border-white/10 text-xs px-4 py-2 hover:bg-white/10 rounded-lg flex-1 sm:flex-initial" onClick={handlePrint}>
            🖨️ PDF / 인쇄하기
          </button>
          <button className="btn bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold px-4 py-2 rounded-lg flex-1 sm:flex-initial" onClick={() => nav('/teach')}>
            수업 종료 및 대시보드
          </button>
        </div>
      </header>

      {/* 탭 네비게이션 (모바일/데스크톱 대응) */}
      <div className="no-print flex border-b border-white/10 bg-[#14181f] overflow-x-auto shrink-0">
        <button
          className={`flex-1 min-w-[100px] py-4 text-center text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'overview' ? 'border-brand text-brand font-extrabold bg-brand/5' : 'border-transparent text-white/50 hover:text-white'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          📊 성과 대시보드
        </button>
        <button
          className={`flex-1 min-w-[100px] py-4 text-center text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'quiz' ? 'border-brand text-brand font-extrabold bg-brand/5' : 'border-transparent text-white/50 hover:text-white'
          }`}
          onClick={() => setActiveTab('quiz')}
        >
          🎮 퀴즈 결과 ({Object.keys(quizSummary).length})
        </button>
        <button
          className={`flex-1 min-w-[100px] py-4 text-center text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'poll' ? 'border-brand text-brand font-extrabold bg-brand/5' : 'border-transparent text-white/50 hover:text-white'
          }`}
          onClick={() => setActiveTab('poll')}
        >
          🗳️ 투표 결과 ({Object.keys(pollSummary).length})
        </button>
        <button
          className={`flex-1 min-w-[100px] py-4 text-center text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'lab' ? 'border-brand text-brand font-extrabold bg-brand/5' : 'border-transparent text-white/50 hover:text-white'
          }`}
          onClick={() => setActiveTab('lab')}
        >
          🔬 AI 활동/Lab ({labSummary.length})
        </button>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6 print-full print-text-dark">
        {/* 인쇄 모드 타이틀 (인쇄 시에만 표시) */}
        <div className="hidden print:block border-b border-gray-300 pb-4 mb-6">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">AI/AX 교육 플랫폼 수업 리포트</span>
          <h1 className="text-3xl font-extrabold text-gray-900 mt-1">{classroom.title}</h1>
          <p className="text-sm text-gray-600 mt-2">
            개설일자: {new Date(classroom.createdAt).toLocaleString()} | 강의실 코드: <b>{classroom.token}</b> | 참여 학생: <b>{participants.length}명</b>
          </p>
        </div>

        {/* 1. 성과 대시보드 탭 */}
        <div className={`${activeTab === 'overview' ? 'block' : 'hidden print:block'} space-y-6`}>
          {/* 핵심 요약 지표 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card bg-white/5 border border-white/10 p-5 rounded-xl flex flex-col justify-between print-card">
              <span className="text-xs text-white/40 font-semibold print-text-muted">👥 총 참여 학생</span>
              <span className="text-3xl font-extrabold mt-2 text-white print-text-dark">{stats.totalParticipants} 명</span>
            </div>
            <div className="card bg-white/5 border border-white/10 p-5 rounded-xl flex flex-col justify-between print-card">
              <span className="text-xs text-white/40 font-semibold print-text-muted">💰 누적 AI 비용</span>
              <span className="text-3xl font-extrabold mt-2 text-white print-text-dark">${stats.totalCost.toFixed(4)}</span>
            </div>
            <div className="card bg-white/5 border border-white/10 p-5 rounded-xl flex flex-col justify-between print-card">
              <span className="text-xs text-white/40 font-semibold print-text-muted">🛡️ 안전 위반 차단</span>
              <span className={`text-3xl font-extrabold mt-2 ${stats.safetyBlocks > 0 ? 'text-down' : 'text-white'} print-text-dark`}>
                {stats.safetyBlocks} 건
              </span>
            </div>
            <div className="card bg-white/5 border border-white/10 p-5 rounded-xl flex flex-col justify-between print-card">
              <span className="text-xs text-white/40 font-semibold print-text-muted">🤖 총 AI 사용 횟수</span>
              <span className="text-3xl font-extrabold mt-2 text-white print-text-dark">
                {Object.values(stats.aiTypeCounts).reduce((a, b) => a + b, 0)} 회
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 학생 목록 & 성적 */}
            <div className="card bg-white/5 border border-white/10 p-5 rounded-xl lg:col-span-2 print-card">
              <h2 className="text-lg font-bold text-white mb-4 print-text-dark">🏆 학생 성적 및 등수</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-white/80 print-text-dark">
                  <thead className="text-xs text-white/40 border-b border-white/10 print-text-muted">
                    <tr>
                      <th className="py-2.5">닉네임</th>
                      <th className="py-2.5 text-center">라이브 퀴즈 점수</th>
                      <th className="py-2.5 text-right">참가 일자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...participants].sort((a, b) => b.score - a.score).map((p, i) => (
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 font-semibold">
                          <span className="mr-2 text-white/40">{i + 1}.</span>
                          {p.nickname}
                        </td>
                        <td className="py-3 text-center text-brand font-mono font-bold">{p.score.toLocaleString()}</td>
                        <td className="py-3 text-right text-xs text-white/40 print-text-muted">
                          {new Date(p.joinedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                    {participants.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-white/40">학생들이 아직 입장하지 않았습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI 기능별 사용 현황 */}
            <div className="card bg-white/5 border border-white/10 p-5 rounded-xl print-card">
              <h2 className="text-lg font-bold text-white mb-4 print-text-dark">🤖 AI 기능별 사용량</h2>
              <div className="space-y-4">
                {Object.entries(stats.aiTypeCounts).map(([type, count]) => (
                  <div key={type} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="capitalize text-white/80 print-text-dark">
                        {type === 'chat' ? '💬 대화형 AI' : type === 'image' ? '🎨 이미지 생성' : type === 'lab' ? '🔬 비교 실험' : `✨ ${type}`}
                      </span>
                      <span className="text-white print-text-dark">{count}회</span>
                    </div>
                    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden print-progress-bar">
                      <div
                        className="bg-brand h-full rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (count / (Object.values(stats.aiTypeCounts).reduce((a, b) => a + b, 0) || 1)) * 100
                          )}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
                {Object.keys(stats.aiTypeCounts).length === 0 && (
                  <p className="text-xs text-white/40 py-4 text-center">AI 실습을 진행하지 않았습니다.</p>
                )}
              </div>
            </div>
          </div>

          {/* 학생별 세부 AI 리포트 */}
          <div className="card bg-white/5 border border-white/10 p-5 rounded-xl print-card print-section">
            <h2 className="text-lg font-bold text-white mb-4 print-text-dark">💻 학생별 AI 호출 통계</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-white/80 print-text-dark">
                <thead className="text-[10px] text-white/40 border-b border-white/10 print-text-muted uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5">닉네임</th>
                    <th className="py-2.5 text-center">일반 대화</th>
                    <th className="py-2.5 text-center">이미지 생성</th>
                    <th className="py-2.5 text-center">역할극</th>
                    <th className="py-2.5 text-center">비유 대조</th>
                    <th className="py-2.5 text-center">글쓰기</th>
                    <th className="py-2.5 text-center">소크라테스 튜터</th>
                    <th className="py-2.5 text-right">추정 비용 (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {participantAiUsages.map((u) => (
                    <tr key={u.nickname} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 font-semibold text-sm">{u.nickname}</td>
                      <td className="py-3 text-center font-mono">{u.chat}회</td>
                      <td className="py-3 text-center font-mono">{u.image}회</td>
                      <td className="py-3 text-center font-mono">{u.roleplay}회</td>
                      <td className="py-3 text-center font-mono">{u.analogy}회</td>
                      <td className="py-3 text-center font-mono">{u.writing}회</td>
                      <td className="py-3 text-center font-mono">{u.tutor}회</td>
                      <td className="py-3 text-right font-mono text-brand font-bold">${u.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                  {participantAiUsages.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-white/40">생성형 AI를 이용한 실습 내역이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. 퀴즈 결과 탭 */}
        <div className={`${activeTab === 'quiz' ? 'block' : 'hidden print:block'} space-y-6 print-section`}>
          <h2 className="text-xl font-extrabold text-white hidden print:block mb-4 text-gray-900 border-b pb-2">🎮 퀴즈 결과 분석</h2>
          {Object.entries(quizSummary).map(([qid, q], idx) => (
            <div key={qid} className="card bg-white/5 border border-white/10 p-5 rounded-xl print-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/5 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="bg-brand/20 text-brand px-2.5 py-1 rounded-lg text-xs font-bold print-badge-green">Q{idx + 1}</span>
                  <h3 className="font-bold text-white text-base print-text-dark">{q.questionText}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-white/40 print-text-muted">평균 정답률:</span>
                  <span
                    className={`text-lg font-extrabold ${
                      q.correctRate >= 70 ? 'text-emerald-400' : q.correctRate < 40 ? 'text-down' : 'text-yellow-400'
                    }`}
                  >
                    {q.correctRate}%
                  </span>
                </div>
              </div>

              {/* 보기 분석 바 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white/50 print-text-muted uppercase">선택 응답 비율</h4>
                  <div className="space-y-2">
                    {q.options.map((opt, oIdx) => {
                      const votes = q.answers[oIdx.toString()] ?? 0;
                      const isCorrect = oIdx === q.correctIndex;
                      const percentage = q.totalAnswers > 0 ? Math.round((votes / q.totalAnswers) * 100) : 0;
                      return (
                        <div key={oIdx} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={`font-semibold ${isCorrect ? 'text-emerald-400 font-bold' : 'text-white/80'} print-text-dark`}>
                              {oIdx + 1}. {opt} {isCorrect && '✅ (정답)'}
                            </span>
                            <span className="text-white/60 print-text-muted">
                              {votes}명 ({percentage}%)
                            </span>
                          </div>
                          <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden print-progress-bar">
                            <div
                              className={`h-full rounded-full ${isCorrect ? 'bg-emerald-500' : 'bg-white/30'}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 개별 오답/정답 상세 */}
                <div>
                  <h4 className="text-xs font-bold text-white/50 print-text-muted uppercase mb-2">학생별 응답 상세</h4>
                  <div className="max-h-[160px] overflow-y-auto space-y-2 border border-white/5 p-3 rounded-lg bg-black/10 custom-scrollbar print-text-dark">
                    {q.studentDetails.map((sd) => (
                      <div key={sd.nickname} className="flex justify-between items-center text-xs">
                        <span className="font-semibold">{sd.nickname}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white/40 font-mono print-text-muted">{sd.responseMs.toLocaleString()}ms</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              sd.isCorrect
                                ? 'bg-emerald-500/20 text-emerald-400 print-badge-green'
                                : 'bg-down/20 text-down print-badge-red'
                            }`}
                          >
                            {sd.isCorrect ? '정답' : '오답'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {q.studentDetails.length === 0 && (
                      <p className="text-xs text-white/30 text-center py-6">제출된 답변이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {Object.keys(quizSummary).length === 0 && (
            <div className="card bg-white/5 border border-white/10 p-10 text-center text-white/40 print-card">
              이 덱에는 실시간 퀴즈 활동이 없습니다.
            </div>
          )}
        </div>

        {/* 3. 투표 결과 탭 */}
        <div className={`${activeTab === 'poll' ? 'block' : 'hidden print:block'} space-y-6 print-section`}>
          <h2 className="text-xl font-extrabold text-white hidden print:block mb-4 text-gray-900 border-b pb-2">🗳️ 투표 결과 분석</h2>
          {Object.entries(pollSummary).map(([pid, p], idx) => (
            <div key={pid} className="card bg-white/5 border border-white/10 p-5 rounded-xl print-card">
              <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="bg-brand/20 text-brand px-2.5 py-1 rounded-lg text-xs font-bold print-badge-green">POLL {idx + 1}</span>
                  <h3 className="font-bold text-white text-base print-text-dark">{p.prompt}</h3>
                </div>
                <span className="text-xs bg-white/10 px-2 py-1 rounded-full text-white/60 print-text-muted uppercase tracking-wider">
                  {p.mode === 'choice' ? '객관식 투표' : '워드클라우드'}
                </span>
              </div>

              {/* 투표 결과 보기 */}
              {p.mode === 'choice' ? (
                <div className="space-y-3 max-w-xl">
                  {p.options.map((opt) => {
                    const votes = p.votes[opt] ?? 0;
                    const percentage = p.totalVotes > 0 ? Math.round((votes / p.totalVotes) * 100) : 0;
                    return (
                      <div key={opt} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-white/80 print-text-dark">{opt}</span>
                          <span className="text-white/60 print-text-muted">
                            {votes}표 ({percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden print-progress-bar">
                          <div className="bg-brand h-full rounded-full" style={{ width: `${percentage}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {p.totalVotes === 0 && (
                    <p className="text-xs text-white/40 text-center py-4">투표한 학생이 없습니다.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-white/50 print-text-muted uppercase">제출된 응답 키워드 (Wordcloud 데이터)</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(p.votes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([word, count]) => {
                        const score = Math.max(1, count);
                        return (
                          <span
                            key={word}
                            className="px-3 py-1.5 rounded-lg border text-sm font-semibold flex items-center gap-1.5 transition"
                            style={{
                              backgroundColor: `rgba(252, 213, 53, ${Math.min(0.8, score * 0.2)})`,
                              color: score > 2 ? '#181a20' : '#ffffff',
                              borderColor: 'rgba(252, 213, 53, 0.4)',
                            }}
                          >
                            <span>{word}</span>
                            <span className="text-[10px] opacity-60 font-mono">x{count}</span>
                          </span>
                        );
                      })}
                    {Object.keys(p.votes).length === 0 && (
                      <p className="text-xs text-white/40 text-center py-4">제출된 주관식 키워드가 없습니다.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {Object.keys(pollSummary).length === 0 && (
            <div className="card bg-white/5 border border-white/10 p-10 text-center text-white/40 print-card">
              이 덱에는 실시간 투표 활동이 없습니다.
            </div>
          )}
        </div>

        {/* 4. AI 실습 & Lab 탭 */}
        <div className={`${activeTab === 'lab' ? 'block' : 'hidden print:block'} space-y-6 print-section`}>
          <h2 className="text-xl font-extrabold text-white hidden print:block mb-4 text-gray-900 border-b pb-2">🔬 AI 실습 및 실험 로그</h2>
          <div className="card bg-white/5 border border-white/10 p-5 rounded-xl print-card">
            <h3 className="font-bold text-white text-base mb-4 print-text-dark">🧪 A/B 비교 비교 실험 (Lab Run) 목록</h3>
            <div className="space-y-4">
              {labSummary.map((l, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-white/5 bg-black/10 text-xs space-y-3 print-card">
                  <div className="flex justify-between items-center text-white/50 print-text-muted">
                    <span className="font-bold text-white print-text-dark">{l.nickname} 학생</span>
                    <span>{new Date(l.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-brand uppercase tracking-wider block mb-1">제출 입력값</span>
                    <p className="text-white text-sm bg-white/5 p-2 rounded print-text-dark">{l.input}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="border border-white/5 p-2 rounded bg-black/20">
                      <span className="text-[9px] text-white/40 block mb-1">A 모델 응답 ({l.labType} 기본)</span>
                      <p className="text-white/80 whitespace-pre-wrap leading-relaxed print-text-dark">{l.output?.outputA || l.output}</p>
                    </div>
                    <div className="border border-white/5 p-2 rounded bg-black/20">
                      <span className="text-[9px] text-white/40 block mb-1">B 모델 응답 ({l.labType} 변형)</span>
                      <p className="text-white/80 whitespace-pre-wrap leading-relaxed print-text-dark">{l.output?.outputB || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              ))}
              {labSummary.length === 0 && (
                <p className="text-xs text-white/40 text-center py-6">진행된 A/B 비교 비교 실험 로그가 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
