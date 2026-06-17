import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center p-6 text-center">
      <div className="text-sm font-bold uppercase tracking-widest text-brand">AI · AX 특강</div>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
        AI와 나의 미래
      </h1>
      <p className="mt-3 text-white/70">
        직접 만지고, 만들고, 생각하는 4시간 생성형 AI 수업
      </p>

      <div className="mt-10 grid w-full gap-3">
        <Link to="/join" className="btn-primary py-4 text-lg">
          🎓 수업 듣기 (학생)
        </Link>
        <Link to="/teach" className="btn-ghost py-4 text-lg">
          🧑‍🏫 강사로 시작하기
        </Link>
      </div>

      <p className="mt-8 text-xs text-white/40">
        로그인 없이 강의실 코드로 입장해요. 스마트폰·태블릿·PC 모두 OK.
      </p>
    </div>
  );
}
