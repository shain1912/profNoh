// 활동 편집 폼 공용 위젯 — defs/*.tsx 편집 폼에서 사용
import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-white/60">
      {label}
      {children}
    </label>
  );
}

export function TextField({
  label, value, onChange, placeholder, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number;
}) {
  return (
    <Field label={label}>
      <input
        className="input mt-1"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label, value, onChange, placeholder, maxLength, rows = 4,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; rows?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        className="input mt-1 resize-y"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** 문자열 목록 편집 (미션 / 예시 프롬프트 / 보기 등) */
export function StringListEditor({
  label, items, onChange, placeholder, maxItems = 8, maxLength = 120, addLabel = '＋ 추가',
}: {
  label: string; items: string[]; onChange: (items: string[]) => void;
  placeholder?: string; maxItems?: number; maxLength?: number; addLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-white/60">{label}</div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input flex-1"
            value={item}
            placeholder={placeholder ?? `${i + 1}번째 항목`}
            maxLength={maxLength}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button className="text-down" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {items.length < maxItems && (
        <button className="btn-ghost px-2 py-1 text-sm" onClick={() => onChange([...items, ''])}>{addLabel}</button>
      )}
    </div>
  );
}

/** 소수 옵션 중 하나 고르기 (genre / subject / labType / mode 등) */
export function ChoiceChips<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-sm text-white/60">{label}</div>
      <div className="flex flex-wrap gap-2 text-sm">
        {options.map((o) => (
          <button
            key={o.value}
            className={['btn-ghost px-3 py-1', value === o.value ? 'text-brand ring-1 ring-brand/40' : ''].join(' ')}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const rid = () => Math.random().toString(36).slice(2, 10);
export const clampStr = (s: unknown, max: number): string => (typeof s === 'string' ? s : '').slice(0, max);
export const strArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : []).slice(0, maxItems).map((x) => clampStr(x, maxLen)).filter(Boolean);
