"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { NoteMeta } from "@/lib/note/firestore";
import { SUBJECTS } from "@/lib/note/textbook-catalog";

type Props = {
  initial: NoteMeta;
  lastMetaBySubject?: Record<string, NoteMeta>;           // subject → 최근 meta (과목 선택 시 자동 채움)
  onClose: () => void;
  onSave: (meta: NoteMeta) => void;
};

export function MetaDialog({ initial, lastMetaBySubject, onClose, onSave }: Props) {
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [grade, setGrade] = useState(initial.grade ?? "");
  const [publisher, setPublisher] = useState(initial.publisher ?? "");
  const [largeUnit, setLargeUnit] = useState(initial.largeUnit ?? "");
  const [middleUnit, setMiddleUnit] = useState(initial.middleUnit ?? "");
  const [smallUnit, setSmallUnit] = useState(initial.smallUnit ?? "");

  // 과목 선택 시, 그 과목으로 마지막에 쓴 노트의 값으로 나머지를 자동 채움
  const handleSubjectChange = (v: string) => {
    setSubject(v);
    const last = v ? lastMetaBySubject?.[v] : undefined;
    setGrade(last?.grade ?? "");
    setPublisher(last?.publisher ?? "");
    setLargeUnit(last?.largeUnit ?? "");
    setMiddleUnit(last?.middleUnit ?? "");
    setSmallUnit(last?.smallUnit ?? "");
  };

  const handleSave = () => {
    onSave({
      subject: subject || undefined,
      grade: grade || undefined,
      publisher: publisher || undefined,
      largeUnit: largeUnit || undefined,
      middleUnit: middleUnit || undefined,
      smallUnit: smallUnit || undefined,
    });
    onClose();
  };

  return (
    <div className="meta-dialog-overlay" onClick={onClose}>
      <div className="meta-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="meta-dialog-header">
          <h3>단원 정보</h3>
          <button className="meta-icon-btn" onClick={onClose} aria-label="닫기">
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="meta-dialog-body">
          <FieldRow label="과목">
            <ChipSelect
              value={subject}
              options={[...SUBJECTS]}
              onChange={handleSubjectChange}
              placeholder=""
            />
          </FieldRow>

          {subject && (
            <>
              <FieldRow label="학년">
                <TextInput value={grade} onChange={setGrade} placeholder="예: 중1, 고2" />
              </FieldRow>

              <FieldRow label="출판사">
                <TextInput value={publisher} onChange={setPublisher} placeholder="예: 비상교육" />
              </FieldRow>

              <div className="meta-divider" />

              <FieldRow label="대단원">
                <TextInput value={largeUnit} onChange={setLargeUnit} placeholder="" />
              </FieldRow>

              <FieldRow label="중단원">
                <TextInput value={middleUnit} onChange={setMiddleUnit} placeholder="" />
              </FieldRow>

              <FieldRow label="소단원">
                <TextInput value={smallUnit} onChange={setSmallUnit} placeholder="" />
              </FieldRow>
            </>
          )}
        </div>

        <div className="meta-dialog-footer">
          <button className="meta-btn-ghost" onClick={onClose}>취소</button>
          <button className="meta-btn-primary" onClick={handleSave}>저장</button>
        </div>
      </div>
      <style>{styles}</style>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="meta-field">
      <label className="meta-field-label">{label}</label>
      <div className="meta-field-value">{children}</div>
    </div>
  );
}

function ChipSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`chip ${value === opt ? "is-selected" : ""}`}
          onClick={() => onChange(value === opt ? "" : opt)}
        >
          {opt}
        </button>
      ))}
      {value && !options.includes(value) && (
        <span className="chip is-selected">{value}</span>
      )}
      {!value && <span className="chip-placeholder">{placeholder}</span>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="meta-text-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

const styles = `
  .meta-dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .meta-dialog {
    background: #fff;
    border-radius: 8px;
    width: 100%;
    max-width: 560px;
    height: 720px;
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  }
  @media (max-width: 720px) {
    .meta-dialog-overlay { padding: 0; align-items: stretch; }
    .meta-dialog {
      border-radius: 0;
      height: 100vh;
      max-height: 100vh;
      max-width: 100vw;
    }
  }
  .meta-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .meta-dialog-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: rgba(0,0,0,0.92);
  }
  .meta-icon-btn {
    width: 28px; height: 28px;
    border: none; background: transparent;
    cursor: pointer; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    color: rgba(0,0,0,0.55);
  }
  .meta-icon-btn:hover { background: rgba(0,0,0,0.05); }

  .meta-dialog-body {
    padding: 20px 20px 80px;
    overflow-y: auto;
    flex: 1;
  }
  .meta-field {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }
  .meta-field-label {
    flex-shrink: 0;
    width: 60px;
    padding-top: 6px;
    font-size: 13px;
    font-weight: 500;
    color: rgba(0,0,0,0.55);
  }
  .meta-field-value { flex: 1; min-width: 0; }
  .meta-divider {
    height: 1px;
    background: rgba(0,0,0,0.06);
    margin: 8px 0 12px;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    border: 1px solid rgba(0,0,0,0.1);
    background: #fff;
    color: rgba(0,0,0,0.7);
    font-size: 13px;
    padding: 4px 10px;
    border-radius: 14px;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }
  .chip:hover { background: rgba(0,0,0,0.04); }
  .chip.is-selected {
    background: #fff;
    color: rgba(0,0,0,0.95);
    border-color: rgba(0,0,0,0.85);
    font-weight: 600;
  }
  .chip-placeholder {
    color: rgba(0,0,0,0.35);
    font-size: 13px;
    padding: 4px 0;
  }
  .meta-text-input {
    width: 100%;
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 4px;
    padding: 7px 10px;
    font-size: 14px;
    color: rgba(0,0,0,0.9);
    outline: none;
    font-family: inherit;
    background: #fff;
  }
  .meta-text-input:focus { border-color: rgba(0,0,0,0.4); }

  .meta-dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px 16px;
    border-top: 1px solid rgba(0,0,0,0.06);
  }
  .meta-btn-ghost, .meta-btn-primary {
    padding: 7px 14px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    border: 1px solid transparent;
  }
  .meta-btn-ghost {
    background: transparent;
    color: rgba(0,0,0,0.6);
  }
  .meta-btn-ghost:hover { background: rgba(0,0,0,0.05); }
  .meta-btn-primary {
    background: #fff;
    color: rgba(0,0,0,0.9);
    border-color: rgba(0,0,0,0.4);
  }
  .meta-btn-primary:hover { background: rgba(0,0,0,0.04); }
`;
