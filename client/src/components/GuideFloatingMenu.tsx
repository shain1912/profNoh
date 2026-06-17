import { useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function GuideFloatingMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const hiddenPrefixes = ['/screen', '/play', '/report'];

  if (hiddenPrefixes.some((prefix) => location.pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 border border-white/10 group"
        title="사용 설명서 보기"
      >
        <span className="text-2xl group-hover:rotate-12 transition-transform duration-200">📖</span>
        <span className="absolute right-16 bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/10 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none font-semibold">
          💡 AI·AX 특강 사용법
        </span>
      </button>

      {/* Overlay Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        />
      )}

      {/* Drawer Container */}
      <div
        className={[
          'fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#151518] border-l border-white/10 shadow-2xl transition-transform duration-300 ease-out flex flex-col',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xl">💡</span>
            <h2 className="text-lg font-bold text-white">AI·AX 특강 사용설명서</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/40 hover:text-white text-xl p-1 transition"
          >
            ✕
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm leading-relaxed text-white/80 scrollbar-thin">
          
          {/* 강사 가이드 */}
          <section className="space-y-3 text-left">
            <div className="flex items-center gap-2 text-brand font-bold text-base border-b border-brand/20 pb-1.5">
              <span>🧑‍🏫</span>
              <h3>강사 (선생님) 사용 가이드</h3>
            </div>
            
            <div className="space-y-3.5 pl-1">
              <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-2">
                <h4 className="font-bold text-white flex items-center gap-1.5 text-xs uppercase tracking-wider text-brand/90">
                  <span className="bg-brand/20 text-brand px-1.5 py-0.5 rounded text-[10px]">Step 1</span>
                  강의 준비 및 개설
                </h4>
                <p className="text-xs text-white/70">
                  메인에서 <b>[강사로 시작하기]</b>를 클릭합니다. 기본 탑재된 <b>[기본 샘플 강의]</b>로 바로 시작하거나, <b>[새 강의 만들기]</b>로 이동해 AI 생성 또는 소장하고 계신 <b>PDF 파일</b>을 업로드하여 수업 자료를 등록할 수 있습니다.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-2">
                <h4 className="font-bold text-white flex items-center gap-1.5 text-xs uppercase tracking-wider text-brand/90">
                  <span className="bg-brand/20 text-brand px-1.5 py-0.5 rounded text-[10px]">Step 2</span>
                  학생 입장 및 코드 공유
                </h4>
                <p className="text-xs text-white/70">
                  강의실이 개설되면 화면 상단에 <b>6자리 강의실 코드</b>(예: <code className="bg-brand/20 text-brand px-1.5 py-0.5 rounded font-mono font-bold">ABC123</code>)가 나타납니다. 코드나 <b>[🔗 학생 링크]</b>를 클릭하여 복사한 후 학생들에게 배포합니다.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-2">
                <h4 className="font-bold text-white flex items-center gap-1.5 text-xs uppercase tracking-wider text-brand/90">
                  <span className="bg-brand/20 text-brand px-1.5 py-0.5 rounded text-[10px]">Step 3</span>
                  원버튼 수업 진행
                </h4>
                <p className="text-xs text-white/70">
                  강사 콘솔 하단의 <b>노란색 대형 액션 버튼</b>을 순서대로 누르면 다음 슬라이드로 넘어가거나 학생들의 폰에 실습/퀴즈/투표가 알아서 개설됩니다. 수업 진행이 매우 편리합니다.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-2">
                <h4 className="font-bold text-white flex items-center gap-1.5 text-xs uppercase tracking-wider text-brand/90">
                  <span className="bg-brand/20 text-brand px-1.5 py-0.5 rounded text-[10px]">Tip</span>
                  실시간 긴급 제어
                </h4>
                <p className="text-xs text-white/70">
                  학생들이 AI 기능(채팅, 이미지 생성 등)을 과도하게 사용하는 등 집중을 방해할 때는 상단의 <b>[⏸ AI 멈춤]</b> 버튼을 눌러 일시 정지시킬 수 있습니다.
                </p>
              </div>
            </div>
          </section>

          {/* 학생 가이드 */}
          <section className="space-y-3 text-left">
            <div className="flex items-center gap-2 text-brand font-bold text-base border-b border-brand/20 pb-1.5">
              <span>🎓</span>
              <h3>학생 사용 가이드</h3>
            </div>
            
            <ul className="space-y-2.5 list-disc list-inside text-xs text-white/70 pl-2">
              <li>선생님께 받은 <b>강의실 코드</b>와 본인의 <b>닉네임</b>을 입력하고 입장합니다.</li>
              <li>선생님의 슬라이드와 진행 순서에 맞춰 퀴즈, 투표, 역할극, AI 대화, 이미지 생성 등의 미션 카드가 스마트폰에 실시간으로 자동 실행됩니다.</li>
              <li><b>퀴즈 미션</b>은 정답을 빠르게 고를수록 높은 점수를 획득해 최종 순위가 올라갑니다!</li>
              <li><b>이미지 생성</b>은 프롬프트 입력 후 생성까지 약 15~20초 정도의 렌더링 시간이 필요하므로 진행바가 차오를 동안 기다려야 합니다.</li>
            </ul>
          </section>

          {/* 신규 기능 가이드 */}
          <section className="space-y-3 text-left">
            <div className="flex items-center gap-2 text-brand font-bold text-base border-b border-brand/20 pb-1.5">
              <span>✨</span>
              <h3>새로 추가된 특별 기능</h3>
            </div>
            
            <div className="space-y-3.5 pl-1">
              <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-1">
                <h5 className="font-bold text-white text-xs">🔒 강사 회원가입 및 영구 보관 (Supabase Auth)</h5>
                <p className="text-xs text-white/60">
                  강의 만들기 화면에서 로그인을 완료하면 제작하신 소중한 강의가 계정에 연동됩니다. 브라우저 캐시가 날아가거나 디바이스를 바꿔도 영구 보관됩니다.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-1">
                <h5 className="font-bold text-white text-xs">📺 유튜브 동영상 재생기 연동</h5>
                <p className="text-xs text-white/60">
                  슬라이드별 편집 화면에서 유튜브 동영상 주소를 등록하면 수업 화면에 고화질 16:9 유튜브 재생 플레이어가 자동으로 연동되어 시청할 수 있습니다.
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </>
  );
}
