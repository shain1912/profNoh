// AI 응답을 기다리는 동안 "멈춘 게 아님"을 보여주는 공용 표시
export default function Thinking({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10">
      <div className="text-sm text-white/80">{text}</div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" />
      </div>
    </div>
  );
}
