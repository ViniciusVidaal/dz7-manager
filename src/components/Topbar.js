import React from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Topbar({ title, subtitle }) {
  const { profile, logout } = useAuth();
  const todayLabel = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.3em] text-slate/50">Resumo</span>
          <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate/70">
            {todayLabel}
          </span>
        </div>
        <h2 className="text-2xl lg:text-3xl font-display text-slate mt-2">{title}</h2>
        {subtitle ? <p className="text-sm text-slate/70 mt-1">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate">{profile?.nome || "Usuario"}</p>
          <p className="text-xs text-slate/60">{profile?.cargo || profile?.role}</p>
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-full border border-slate/20 bg-white/70 px-4 py-2 text-xs text-slate hover:bg-white"
        >
          <LogOut size={14} />
          Sair
        </button>
      </div>
    </div>
  );
}
