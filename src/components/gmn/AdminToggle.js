import React from "react";

export default function AdminToggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      className={`gmn-admin-toggle ${checked ? "is-on" : "is-off"}`}
      onClick={() => onChange(!checked)}
    >
      <span className="gmn-admin-toggle-text">{label}</span>
      <span className="gmn-admin-toggle-track" aria-hidden="true">
        <span className="gmn-admin-toggle-thumb" />
      </span>
    </button>
  );
}
