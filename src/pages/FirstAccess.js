import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function FirstAccess() {
  const { completeFirstAccess } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas nao conferem.");
      return;
    }
    setLoading(true);
    try {
      await completeFirstAccess(password);
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err) {
      setError("Nao foi possivel atualizar sua senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel rounded-[32px] p-10 w-full max-w-lg">
        <div className="flex items-center gap-3 text-tide">
          <ShieldCheck size={22} />
          <p className="text-xs uppercase tracking-[0.3em]">Primeiro acesso</p>
        </div>
        <h1 className="font-display text-3xl text-slate mt-4">Defina sua nova senha</h1>
        <p className="text-sm text-slate/70 mt-2">
          Por seguranca, voce precisa atualizar sua senha antes de acessar o painel.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm outline-none"
            placeholder="Nova senha"
          />
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="w-full rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm outline-none"
            placeholder="Confirmar senha"
          />
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {success ? (
            <p className="text-sm text-tide">Senha atualizada. Redirecionando...</p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-ink text-white py-3 text-sm font-medium hover:bg-ink/90"
          >
            {loading ? "Salvando..." : "Atualizar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
