import React from "react";

export default function Modal({ open, onClose, title, children, actions }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate/40 backdrop-blur-sm p-6">
      <div className="glass-panel w-full max-w-2xl rounded-3xl p-8 fade-up">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-display text-slate">{title}</h3>
          <button
            onClick={onClose}
            className="text-xs uppercase tracking-[0.2em] text-slate/60 hover:text-slate"
          >
            Fechar
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {actions ? <div className="mt-6 flex justify-end gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
