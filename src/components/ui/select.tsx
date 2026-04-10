// 표준 select 드롭다운 컴포넌트
//
// 패턴 출처: GREATBOOKSCLUB / books-100-stars.css 의
//   .profile-panel__birthday-select
// 핵심: appearance 제거 + 커스텀 SVG 화살표 + 우측 패딩 확보

const ARROW_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2371717a'/%3E%3C/svg%3E`;

type Option = { value: string; label: string };

export function Select({
  value,
  onChange,
  options,
  placeholder = "선택",
  required,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly Option[] | readonly string[];
  placeholder?: string;
  required?: boolean;
  ariaLabel?: string;
}) {
  // string 배열도 받을 수 있게 정규화
  const normalized: Option[] = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      aria-label={ariaLabel}
      style={{
        backgroundImage: `url("${ARROW_SVG}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        backgroundSize: "10px 6px",
        WebkitAppearance: "none",
        MozAppearance: "none",
        appearance: "none",
      }}
      className="w-full cursor-pointer rounded-xl border border-zinc-300 bg-white py-3 pl-4 pr-10 text-base text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
