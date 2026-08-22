// AI 응답을 기다리는 동안 "멈춘 게 아님"을 보여주는 공용 표시
export default function Thinking({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl bg-surface-2 p-4 text-center ring-1 ring-hairline">
      <div className="text-sm text-body">{text}</div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" />
      </div>
    </div>
  );
}
