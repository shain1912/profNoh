import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDeck, generateDeck, getMyDecks, rememberDeck, listDecks } from '../lib/buildApi';
import { apiPost } from '../lib/api';

const TOPIC_CHIPS = ['생성형 AI 입문', 'AI 윤리와 안전', '프롬프트 기초', 'AI와 진로', '딥러닝 쉽게 이해하기'];
const AUDIENCE_CHIPS = ['중학교 1학년', '고등학교 1학년', '고등학교 2학년', '일반 성인'];

const EXAMPLE_CHIPS = [
  {
    topic: '세종대왕님과 나누는 한글 창제 토론',
    label: '🎭 역사 역할극 (세종대왕)',
    activities: ['roleplay'] as const,
  },
  {
    topic: '생활 속 비유로 깨치는 양자역학 기초',
    label: '🔍 양자역학 비유 비교',
    activities: ['analogy'] as const,
  },
  {
    topic: '인공지능과 함께 쓰는 릴레이 감성 시 창작',
    label: '✍️ 시 창작 에세이 랩',
    activities: ['writing'] as const,
  },
  {
    topic: '파이썬 코딩 입문 및 알고리즘 힌트 과제',
    label: '🧮 코딩 디버깅 튜터',
    activities: ['tutor'] as const,
  },
];

export default function Build() {
  const nav = useNavigate();
  const mine = getMyDecks();

  const [user, setUser] = useState<{ email: string } | null>(() => {
    const saved = localStorage.getItem('axedu_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [continueAsGuest, setContinueAsGuest] = useState(false);
  const [authSyncing, setAuthSyncing] = useState(false);
  const [dbDecks, setDbDecks] = useState<any[]>([]);

  const loadDbDecks = async () => {
    try {
      const list = await listDecks();
      setDbDecks(list);
    } catch {
      /* ignore */
    }
  };

  const syncUserSession = async (token: string) => {
    setAuthSyncing(true);
    try {
      localStorage.setItem('axedu_auth_token', token);
      const r = await apiPost<{ user: { email: string } }>('/api/auth/me', {});
      if (r.user?.email) {
        localStorage.setItem('axedu_user', JSON.stringify({ email: r.user.email }));
        setUser({ email: r.user.email });
      }
    } catch (err: any) {
      console.error('Failed to sync session:', err);
      localStorage.removeItem('axedu_auth_token');
      localStorage.removeItem('axedu_user');
      setUser(null);
    } finally {
      setAuthSyncing(false);
    }
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        syncUserSession(accessToken);
        return;
      }
    }

    const existingToken = localStorage.getItem('axedu_auth_token');
    if (existingToken && !user) {
      syncUserSession(existingToken);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadDbDecks();
    } else {
      setDbDecks([]);
    }
  }, [user]);

  const handleGoogleLogin = () => {
    window.location.href = `https://supabase-axedu.kodekorea.kr/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin + '/build')}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('axedu_auth_token');
    localStorage.removeItem('axedu_user');
    setUser(null);
  };

  const mergedDecks = [...dbDecks];
  mine.forEach((m) => {
    if (!mergedDecks.some((d) => d.id === m.deckId)) {
      mergedDecks.push({
        id: m.deckId,
        title: m.title,
        slideCount: 0,
        updatedAt: '',
        isLocalOnly: true,
      });
    }
  });

  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function makeBlank() {
    setBusy(true); setErr('');
    try {
      const r = await createDeck(title.trim() || '새 강의');
      rememberDeck({ deckId: r.deckId, title: title.trim() || '새 강의', pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) { setErr(e.message ?? '생성 실패'); } finally { setBusy(false); }
  }

  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('고등학교 1학년');
  const [parts, setParts] = useState(3);
  const [quizPerPart, setQuizPerPart] = useState(1);
  const [selectedActs, setSelectedActs] = useState<Array<'roleplay' | 'analogy' | 'writing' | 'tutor'>>(['roleplay', 'analogy']);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  async function makeAi() {
    setGenBusy(true); setGenErr('');
    try {
      const r = await generateDeck({ topic: topic.trim(), audience, parts, quizPerPart, activities: selectedActs });
      rememberDeck({ deckId: r.deckId, title: topic.trim(), pin: r.editPin });
      nav(`/build/${r.deckId}`);
    } catch (e: any) { setGenErr(e.message ?? '생성 실패'); } finally { setGenBusy(false); }
  }

  // PDF / PPTX 업로드 상태
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [showPptxModal, setShowPptxModal] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // PPTX 파일인 경우 PDF 변환 모달 팝업
    if (file.name.toLowerCase().endsWith('.pptx')) {
      setShowPptxModal(true);
      e.target.value = ''; // 선택 리셋
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadErr('PDF 파일만 업로드할 수 있습니다.');
      return;
    }

    setUploadBusy(true);
    setUploadErr('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const r = await apiPost<{ deckId: string; editPin: string }>('/api/decks/upload-pdf', {
            filename: file.name,
            base64,
          });
          rememberDeck({ deckId: r.deckId, title: file.name.replace(/\.[^/.]+$/, ""), pin: r.editPin });
          nav(`/build/${r.deckId}`);
        } catch (err: any) {
          setUploadErr(err.message ?? '업로드 및 덱 생성에 실패했습니다.');
          setUploadBusy(false);
        }
      };
      reader.onerror = () => {
        setUploadErr('파일을 읽는 데 실패했습니다.');
        setUploadBusy(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadErr(err.message ?? '파일 읽기 중 오류 발생');
      setUploadBusy(false);
    }
  }

  if (authSyncing) {
    return (
      <div className="mx-auto max-w-md p-6 min-h-[80vh] flex flex-col justify-center items-center animate-fade-in">
        <div className="text-center space-y-4">
          <div className="inline-block rounded-2xl bg-brand/10 p-4 text-brand text-3xl mb-1 animate-pulse">
            🔑
          </div>
          <h1 className="text-xl font-bold text-white">Google 로그인 처리 중...</h1>
          <p className="text-xs text-white/50 font-normal">계정 정보를 동기화하고 있습니다.</p>
          <div className="mt-3 h-2 w-32 overflow-hidden rounded-full bg-white/10 mx-auto">
            <div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" />
          </div>
        </div>
      </div>
    );
  }

  if (!user && !continueAsGuest) {
    return (
      <div className="mx-auto max-w-md p-6 min-h-[80vh] flex flex-col justify-center animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-block rounded-2xl bg-brand/10 p-4 text-brand text-3xl mb-3">
            🧑‍🏫
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">강사 로그인</h1>
          <p className="text-sm text-muted mt-2 font-normal">
            작성하시는 소중한 강의안이 안전하게 저장·동기화됩니다.
          </p>
        </div>

        <div className="card space-y-6 text-center">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-white text-black hover:bg-neutral-100 px-6 py-3.5 text-sm font-bold transition-all shadow-lg hover:shadow-white/5 active:scale-[0.99]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google 계정으로 계속하기</span>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-hairline"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-canvas px-2 text-muted">또는</span>
            </div>
          </div>

          <button
            type="button"
            className="w-full rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 px-6 py-3.5 text-sm font-semibold transition active:scale-[0.99] text-white/90"
            onClick={() => setContinueAsGuest(true)}
          >
            🔑 로그인 없이 비회원으로 계속하기
          </button>
          
          <p className="text-[11px] text-muted leading-relaxed font-normal">
            비회원으로 진행 시 강의 정보는 이 브라우저(LocalStorage)에만 보관되며,<br />
            브라우저 캐시를 삭제하거나 기기를 변경할 시 복구가 불가능합니다.
          </p>
        </div>

        <button
          type="button"
          className="text-xs text-muted hover:text-body transition underline mt-4 block mx-auto"
          onClick={() => nav('/teach')}
        >
          이전 화면으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-extrabold">강의 만들기 🛠️</h1>

      {/* 로그인 상태바 */}
      <div className="flex items-center justify-between rounded-xl bg-white/5 p-4 ring-1 ring-white/10 mt-3 text-sm">
        {user ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">●</span>
              <span><b>{user.email}</b> 계정으로 로그인됨</span>
            </div>
            <button className="text-xs text-white/50 hover:text-white underline" onClick={handleLogout}>
              로그아웃
            </button>
          </>
        ) : (
          <>
            <div className="text-white/60 text-xs sm:text-sm">
              🔑 로그인 시 작성하신 강의가 계정에 자동 동기화되어 안전하게 보관됩니다.
            </div>
            <button
              className="btn bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 ml-2"
              onClick={handleGoogleLogin}
            >
              Google 로그인
            </button>
          </>
        )}
      </div>

      {/* AI 생성 */}
      <div className="card mt-4 space-y-3 ring-1 ring-brand/30">
        <div className="text-sm font-bold text-brand">✨ AI로 만들기</div>
        {step === 1 ? (
          <>
            <input className="input text-white" placeholder="강의 주제를 적어줘" value={topic} maxLength={80} onChange={(e) => setTopic(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {TOPIC_CHIPS.map((c) => (
                <button key={c} className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20" onClick={() => setTopic(c)}>{c}</button>
              ))}
            </div>

            <div className="mt-2 text-xs text-white/50 font-semibold">💡 AI 실습 연계 추천 예제 (원클릭 자동 선택):</div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_CHIPS.map((item) => (
                <button
                  key={item.label}
                  className="rounded-xl bg-brand/10 border border-brand/20 text-brand px-3 py-1.5 text-xs hover:bg-brand/20 transition-all font-semibold"
                  onClick={() => {
                    setTopic(item.topic);
                    setSelectedActs([...item.activities]);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button className="btn-primary w-full mt-2" disabled={!topic.trim()} onClick={() => setStep(2)}>다음 ▶</button>
          </>
        ) : (
          <>
            <div className="text-sm text-white/70">주제: <b>{topic}</b></div>
            <div>
              <div className="mb-1 text-sm text-white/60">대상</div>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_CHIPS.map((c) => (
                  <button key={c} className={['rounded-full px-3 py-1 text-sm', audience === c ? 'bg-brand text-on-brand' : 'bg-white/10 hover:bg-white/20'].join(' ')} onClick={() => setAudience(c)}>{c}</button>
                ))}
              </div>
            </div>
            <label className="block text-sm text-white/60">파트 수: {parts}
              <input type="range" min={2} max={6} value={parts} className="w-full" onChange={(e) => setParts(Number(e.target.value))} />
            </label>
            <label className="block text-sm text-white/60">파트당 퀴즈: {quizPerPart}
              <input type="range" min={0} max={3} value={quizPerPart} className="w-full" onChange={(e) => setQuizPerPart(Number(e.target.value))} />
            </label>

            <div>
              <div className="mb-2 text-sm text-white/60">포함할 신규 AI 실습 활동</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'roleplay', label: '🎭 AI 역할극' },
                  { id: 'analogy', label: '🔍 눈높이 비유' },
                  { id: 'writing', label: '✍️ 문학 창작' },
                  { id: 'tutor', label: '🧮 AI 튜터' },
                ].map((act) => {
                  const active = selectedActs.includes(act.id as any);
                  return (
                    <button
                      key={act.id}
                      className={[
                        'flex items-center gap-2 p-2.5 rounded-xl border text-xs text-left transition-all',
                        active
                          ? 'bg-brand/10 border-brand text-brand font-bold ring-1 ring-brand/20'
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10',
                      ].join(' ')}
                      onClick={() => {
                        setSelectedActs((prev) =>
                          active ? prev.filter((x) => x !== act.id) : [...prev, act.id as any]
                        );
                      }}
                    >
                      <span>{active ? '☑' : '☐'}</span>
                      <span>{act.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {genBusy ? (
              <div className="rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10">
                <div className="text-sm text-white/80">✨ AI가 강의를 만드는 중… 최대 30초 정도 걸려요</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" /></div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="btn-ghost px-4" onClick={() => setStep(1)}>← 이전</button>
                <button className="btn-primary flex-1" onClick={makeAi}>✨ 강의 만들기</button>
              </div>
            )}
            {genErr && <p className="text-sm text-down">{genErr}</p>}
          </>
        )}
      </div>

      {/* PDF 및 PPTX 업로드 */}
      <div className="card mt-4 space-y-3 ring-1 ring-brand/30">
        <div className="text-sm font-bold text-brand">📄 PDF / PPTX 파일로 만들기</div>
        <p className="text-xs text-white/50">
          준비된 PDF 자료를 업로드하면 바로 강의용 슬라이드로 변환되어 수업에 사용할 수 있습니다.
        </p>

        {uploadBusy ? (
          <div className="rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10">
            <div className="text-sm text-white/80">📄 파일을 업로드하고 슬라이드를 구성하는 중…</div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="file"
              accept=".pdf,.pptx"
              className="hidden"
              id="pdf-file-input"
              onChange={handleFileChange}
            />
            <label
              htmlFor="pdf-file-input"
              className="btn-primary w-full py-3 text-center cursor-pointer block font-bold transition active:scale-[0.99]"
            >
              📂 발표 자료 선택 및 업로드
            </label>
          </div>
        )}

        {uploadErr && <p className="text-sm text-down">{uploadErr}</p>}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-white/50">또는 빈 강의로 직접 만들기</summary>
        <div className="card mt-2 space-y-3">
          <input className="input" placeholder="강의 제목" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-ghost w-full" onClick={makeBlank} disabled={busy}>{busy ? '만드는 중…' : '＋ 빈 강의 만들기'}</button>
          {err && <p className="text-sm text-down">{err}</p>}
        </div>
      </details>

      <h2 className="mt-8 text-lg font-bold">내 강의</h2>
      {mergedDecks.length === 0 ? (
        <p className="mt-2 text-white/50">아직 만든 강의가 없어요.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {mergedDecks.map((d) => (
            <button key={d.id} className="btn-ghost justify-between" onClick={() => nav(`/build/${d.id}`)}>
              <div className="flex items-center gap-2 text-left">
                <span>{d.title}</span>
                {d.isLocalOnly && (
                  <span className="text-[10px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded font-normal shrink-0">
                    로컬 전용
                  </span>
                )}
              </div>
              <span className="text-xs text-white/40">{d.id}</span>
            </button>
          ))}
        </div>
      )}

      {/* PPTX 안내 모달 */}
      {showPptxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="card max-w-md w-full bg-[#1e1e24] ring-1 ring-brand/40 shadow-2xl p-6 relative">
            <button
              className="absolute top-4 right-4 text-white/50 hover:text-white text-lg"
              onClick={() => setShowPptxModal(false)}
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-brand">PowerPoint (.pptx) 변환 안내</h2>
            <div className="mt-4 text-sm leading-relaxed text-white/80 space-y-3 font-normal">
              <p>
                PowerPoint(.pptx) 파일은 웹 브라우저에서 직접 불러오면 줄바꿈, 폰트, 레이아웃이 깨질 가능성이 매우 높습니다.
              </p>
              <p className="font-semibold text-brand">
                가장 완벽한 수업 슬라이드를 만드는 간단한 방법:
              </p>
              <ol className="list-decimal list-inside space-y-2 bg-white/5 p-3 rounded-lg text-xs">
                <li>PowerPoint 또는 Keynote에서 파일을 엽니다.</li>
                <li><b>[파일] &gt; [다른 이름으로 저장]</b> (또는 <b>[내보내기]</b>)을 선택합니다.</li>
                <li>파일 형식을 <b>'PDF (*.pdf)'</b>로 지정해 저장합니다.</li>
                <li>저장된 <b>PDF 파일</b>을 업로드해 주세요!</li>
              </ol>
            </div>
            <button
              className="btn-primary mt-6 w-full py-2.5 font-bold transition active:scale-[0.99]"
              onClick={() => setShowPptxModal(false)}
            >
              확인했습니다
            </button>
          </div>
        </div>
      )}


    </div>
  );
}
