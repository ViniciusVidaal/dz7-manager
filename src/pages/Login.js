import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import Modal from "../components/Modal";

export default function Login() {
  const { login, requestPasswordReset, user, profile } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetInfo, setResetInfo] = useState("");

  useEffect(() => {
    if (user && profile && !profile.primeiroAcesso) {
      navigate("/dashboard", { replace: true });
    }
    if (user && profile?.primeiroAcesso) {
      navigate("/primeiro-acesso", { replace: true });
    }
  }, [user, profile, navigate]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError("Nao foi possivel entrar. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetInfo("");
    if (!resetEmail) {
      setResetInfo("Informe um email para continuar.");
      return;
    }
    try {
      await requestPasswordReset(resetEmail);
      setResetInfo("Solicitacao enviada. O admin foi notificado.");
    } catch (err) {
      setResetInfo("Nao foi possivel enviar o email agora.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel rounded-[32px] p-10 w-full max-w-lg">
        <p className="text-xs uppercase tracking-[0.3em] text-slate/60">Dz7 Marketing</p>
        <h1 className="font-display text-3xl text-slate mt-4">Bem-vindo de volta</h1>
        <p className="text-sm text-slate/60 mt-2">
          Acompanhe leads, contratos e saude financeira em um unico painel.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleLogin}>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-slate/60">Email</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate/20 bg-white px-4 py-3">
              <Mail size={16} className="text-slate/50" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent outline-none text-sm"
                placeholder="voce@dz7.com"
                required
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-slate/60">Senha</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate/20 bg-white px-4 py-3">
              <Lock size={16} className="text-slate/50" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent outline-none text-sm"
                placeholder="********"
                required
              />
            </div>
          </label>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-ink text-white py-3 text-sm font-medium hover:bg-ink/90"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <button
          onClick={() => setResetOpen(true)}
          className="mt-4 text-xs uppercase tracking-[0.25em] text-tide hover:text-ink"
        >
          Esqueci minha senha
        </button>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Recuperar senha"
        actions={
          <>
            <button
              onClick={() => setResetOpen(false)}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate/60"
            >
              Cancelar
            </button>
            <button
              onClick={handleReset}
              className="rounded-full bg-ink px-5 py-2 text-xs uppercase tracking-[0.2em] text-white"
            >
              Enviar
            </button>
          </>
        }
      >
        <p className="text-sm text-slate/70">
          Informe o email cadastrado. Enviaremos um link de redefinicao e o admin sera notificado.
        </p>
        <input
          type="email"
          value={resetEmail}
          onChange={(event) => setResetEmail(event.target.value)}
          className="w-full rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm outline-none"
          placeholder="email@dz7.com"
        />
        {resetInfo ? <p className="text-sm text-tide">{resetInfo}</p> : null}
      </Modal>
    </div>
  );
}
