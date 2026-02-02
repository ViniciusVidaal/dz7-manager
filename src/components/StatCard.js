import React from "react";

export default function StatCard({ title, value, hint, accent = "tide" }) {
  const accentClass =
    accent === "glow"
      ? "from-glow/30 to-glow/5 text-glow"
      : "from-tide/30 to-tide/5 text-tide";

  return (
    <div className="glass-panel rounded-3xl p-6 card-shadow hover-lift relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accentClass}`} />
      <p className="text-xs uppercase tracking-[0.2em] text-slate/60">{title}</p>
      <div className="mt-4 flex items-end justify-between">
        <h3 className="text-3xl font-display text-slate">{value}</h3>
        <span className={`text-xs px-3 py-1 rounded-full bg-gradient-to-r ${accentClass}`}>
          {hint}
        </span>
      </div>
    </div>
  );
}
