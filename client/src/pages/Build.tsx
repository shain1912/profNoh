import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDeck, generateDeck, getMyDecks, rememberDeck } from '../lib/buildApi';
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

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-extrabold">강의 만들기 🛠️</h1>

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
      {mine.length === 0 ? (
        <p className="mt-2 text-white/50">아직 만든 강의가 없어요.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {mine.map((d) => (
            <button key={d.deckId} className="btn-ghost justify-between" onClick={() => nav(`/build/${d.deckId}`)}>
              <span>{d.title}</span><span className="text-xs text-white/40">{d.deckId}</span>
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
            <div className="mt-4 text-sm leading-relaxed text-white/80 space-y-3">
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
