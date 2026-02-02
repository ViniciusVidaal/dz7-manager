import React, { useMemo, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc, Timestamp } from "firebase/firestore";
import { HandCoins } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDate, getMonthRef } from "../utils/format";
import { normalizeDate } from "../utils/filters";

const getPreviousMonthRef = (date) => {
  const base = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return getMonthRef(base);
};

export default function Payroll() {
  const { isAdmin } = useAuth();
  const { data: users } = useCollection("users", "createdAt", { enabled: isAdmin });
  const { data: finance } = useCollection("finance", "data", { enabled: isAdmin });

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("valor");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [info, setInfo] = useState("");

  const now = new Date();
  const previousMonthRef = getPreviousMonthRef(now);

  const financePrev = useMemo(
    () =>
      finance.filter((item) => {
        const date = normalizeDate(item.data);
        return getMonthRef(date) === previousMonthRef;
      }),
    [finance, previousMonthRef]
  );

  const faturamentoPrev = financePrev
    .filter((item) => item.tipo === "entrada")
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const gastosPrev = financePrev
    .filter((item) => item.tipo === "saida")
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const lucroPrev = faturamentoPrev - gastosPrev;

  const filteredUsers = users.filter((user) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const nome = String(user.nome || "").toLowerCase();
    return nome.includes(term);
  });

  const openPay = (user) => {
    setSelected(user);
    const defaultMode = user.role === "admin" ? "percentual" : "valor";
    setMode(defaultMode);
    setAmount("");
    setPercent("");
    setInfo("");
    setOpen(true);
  };

  const computedAmount = useMemo(() => {
    if (mode === "percentual") {
      const pct = Number(percent || 0);
      if (!pct) return 0;
      return Math.max(0, (lucroPrev * pct) / 100);
    }
    return Number(amount || 0);
  }, [mode, percent, amount, lucroPrev]);

  const handlePay = async () => {
    setInfo("");
    if (!selected) return;
    if (selected.lastPaymentMonth === previousMonthRef) {
      setInfo("Pagamento desse mes ja registrado.");
      return;
    }
    if (computedAmount <= 0) {
      setInfo("Informe um valor valido.");
      return;
    }

    const nowTs = Timestamp.now();
    await addDoc(collection(db, "finance"), {
      data: nowTs,
      valor: computedAmount,
      tipo: "saida",
      categoria: "Folha de pagamento",
      descricao: `Pagamento ${selected.nome || ""} - ${previousMonthRef}`,
      employeeId: selected.id,
      employeeName: selected.nome || "",
      referenceMonth: previousMonthRef,
      paymentMode: mode,
      paymentPercent: mode === "percentual" ? Number(percent || 0) : null,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "users", selected.id), {
      lastPaymentMonth: previousMonthRef,
      lastPaymentValue: computedAmount,
      lastPaymentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setOpen(false);
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Topbar title="Pagamentos" subtitle="Acesso restrito" />
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm text-slate/60">Somente administradores podem pagar funcionarios.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Topbar title="Pagamentos" subtitle="Folha do dia 1 (lucro do mes anterior)" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60">Lucro mes anterior</p>
          <h3 className="text-3xl font-display text-slate mt-3">{formatCurrency(lucroPrev)}</h3>
          <p className="text-sm text-slate/60 mt-2">Referencia: {previousMonthRef}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex-1 max-w-xl">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Buscar por nome..."
          />
        </div>
      </div>

      <DataTable
        columns={[
          { key: "nome", label: "Nome" },
          { key: "cargo", label: "Cargo" },
          { key: "role", label: "Role" },
          {
            key: "lastPayment",
            label: "Ultimo pagamento",
            render: (row) =>
              row.lastPaymentAt ? formatDate(normalizeDate(row.lastPaymentAt)) : "-",
          },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => (
              <button
                onClick={() => openPay(row)}
                className="text-xs uppercase tracking-[0.2em] text-emerald-600 inline-flex items-center gap-1"
              >
                <HandCoins size={12} />
                Pagar
              </button>
            ),
          },
        ]}
        rows={filteredUsers}
        empty="Nenhum usuario cadastrado."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Pagamento - ${selected?.nome || ""}`}
        actions={
          <>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate/60"
            >
              Cancelar
            </button>
            <button
              onClick={handlePay}
              className="rounded-full bg-ink px-5 py-2 text-xs uppercase tracking-[0.2em] text-white"
            >
              Confirmar
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate/70">
          <p>
            Referencia: <span className="font-medium">{previousMonthRef}</span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            >
              <option value="valor">Valor fixo</option>
              <option value="percentual">Percentual do lucro</option>
            </select>
            {mode === "percentual" ? (
              <input
                type="number"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                placeholder="Percentual (ex: 20)"
              />
            ) : (
              <input
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                placeholder="Valor pago"
              />
            )}
          </div>
          <div className="rounded-2xl border border-slate/10 bg-white/60 px-4 py-3">
            <p className="text-xs text-slate/60">Valor calculado</p>
            <p className="text-lg font-medium text-slate">{formatCurrency(computedAmount)}</p>
          </div>
          {info ? <p className="text-sm text-rose-500">{info}</p> : null}
        </div>
      </Modal>
    </Layout>
  );
}
