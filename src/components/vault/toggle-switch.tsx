"use client";

type Props = {
  on: boolean;
  onColor: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
};

/** 가계부 패널 공용 온/오프 토글 (44x24 pill) */
export function ToggleSwitch({ on, onColor, disabled, title, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        border: "none",
        background: disabled ? "#ddd" : on ? onColor : "#ccc",
        position: "relative",
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: on ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
