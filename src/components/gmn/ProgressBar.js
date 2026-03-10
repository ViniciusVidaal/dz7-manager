import React from "react";

export default function ProgressBar({ value, label }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="gmn-progress">
      <div className="gmn-progress-head">
        <span>{label}</span>
        <strong>{safeValue}%</strong>
      </div>
      <div className="gmn-progress-track">
        <div className="gmn-progress-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
