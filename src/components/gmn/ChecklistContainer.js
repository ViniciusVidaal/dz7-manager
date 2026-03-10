import React from "react";

export default function ChecklistContainer({ children }) {
  return (
    <section
      className="gmn-checklist-container"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(73, 65, 129, 0.86), rgba(22, 20, 42, 0.74)), url(${process.env.PUBLIC_URL}/background.png)`,
      }}
    >
      <div className="gmn-checklist-overlay" />
      <div className="gmn-checklist-content">{children}</div>
    </section>
  );
}
