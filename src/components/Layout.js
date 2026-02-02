import React, { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate/70"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <Sidebar
            className="relative h-full z-50 shadow-2xl"
            onNavigate={() => setSidebarOpen(false)}
          />
        </div>
      ) : null}

      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-30 rounded-full bg-white/90 p-3 shadow-lg text-slate"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 pt-16 sm:pt-8 lg:pt-10 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-28 h-96 w-96 rounded-full bg-tide/15 blur-[140px]" />
          <div className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-glow/15 blur-[140px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.08),transparent_55%)]" />
        </div>
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
