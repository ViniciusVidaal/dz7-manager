import React from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BadgeCheck,
  Briefcase,
  ClipboardList,
  CreditCard,
  DollarSign,
  HandCoins,
  LayoutGrid,
  Settings,
  Target,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import brandLogo from "../assets/logocerta.png";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/metas", label: "Metas", icon: Target, adminOnly: true },
  { to: "/leads", label: "Leads", icon: ClipboardList },
  { to: "/clientes", label: "Clientes", icon: Briefcase, adminOnly: true },
  { to: "/investimentos", label: "Investimentos", icon: Activity },
  { to: "/financeiro", label: "Financeiro", icon: DollarSign, adminOnly: true },
  { to: "/ferramentas", label: "Ferramentas", icon: CreditCard, adminOnly: true },
  { to: "/pagamentos", label: "Pagamentos", icon: HandCoins, adminOnly: true },
  { to: "/usuarios", label: "Usuarios", icon: Briefcase, adminOnly: true },
  { to: "/aprovacoes", label: "Aprovacoes", icon: BadgeCheck, adminOnly: true },
];

export default function Sidebar({ className = "", onNavigate }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  return (
    <aside
      className={`w-72 bg-gradient-to-b from-[#0b1015] via-[#0f1720] to-[#0b1015] text-white flex flex-col p-6 gap-8 border-r border-white/10 ${className}`}
    >
      <div className="space-y-4">
        <img
          src={brandLogo}
          alt="Dz7 Marketing"
          className="h-12 w-auto max-w-[220px] object-contain"
        />
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/40">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Online
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {navItems
          .filter((item) => (item.adminOnly ? isAdmin : true))
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                    isActive
                      ? "bg-white text-ink shadow-glow"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`
                }
              >
                <span className="h-9 w-9 rounded-xl bg-white/10 grid place-items-center group-hover:bg-white/20">
                  <Icon size={18} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
      </nav>

      <div className="rounded-2xl bg-white/10 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{profile?.nome || "Usuario"}</p>
          <p className="text-xs text-white/60">{profile?.cargo || profile?.role}</p>
        </div>
        <Settings size={16} className="text-white/60" />
      </div>
    </aside>
  );
}
