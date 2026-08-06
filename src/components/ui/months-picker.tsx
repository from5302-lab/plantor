"use client";

export const MONTHS_OPTIONS = [
  { months: 1, label: "1개월" },
  { months: 3, label: "3개월" },
  { months: 6, label: "6개월" },
  { months: 12, label: "12개월" },
];

export function MonthsPicker({
  value,
  onChange,
  className = "flex gap-1 mt-1 mb-1 ml-5",
}: {
  value: number | null;
  onChange: (m: number) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {MONTHS_OPTIONS.map(({ months, label }) => {
        const active = value === months;
        return (
          <button
            key={months}
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(months); }}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer"
            style={{
              border: active ? "1.5px solid #1f7a33" : "1px solid rgba(0,0,0,0.1)",
              backgroundColor: active ? "#f0fff4" : "#fff",
              color: active ? "#1f7a33" : "#a39e98",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
