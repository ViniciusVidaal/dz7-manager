import React, { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { Plus } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDate, parseDateInput, toDateInputValue } from "../utils/format";
import { normalizeDate } from "../utils/filters";

const initialForm = {
  valor: "",
  termino: "",
};

const calculateGoalProgress = (goal, finance) => {
  const endDate = normalizeDate(goal.termino);
  if (!endDate) {
    return { progress: 0, remaining: Number(goal.valor || 0), percent: 0 };
  }
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const periodEnd = new Date(endDate);
  periodEnd.setHours(23, 59, 59, 999);

  const entradas = finance.reduce((acc, item) => {
    if (item.tipo !== "entrada") return acc;
    const date = normalizeDate(item.data);
    if (!date) return acc;
    if (date < startDate || date > periodEnd) return acc;
    return acc + Number(item.valor || 0);
  }, 0);

  const total = entradas;
  const metaValue = Number(goal.valor || 0);
  const remaining = Math.max(metaValue - total, 0);
  const percent = metaValue > 0 ? Math.min(100, (total / metaValue) * 100) : 0;

  return { progress: total, remaining, percent };
};

export default function Goals() {
  const { isAdmin } = useAuth();
  const { data: goals, error: goalsError } = useCollection("goals", "termino", {
    enabled: isAdmin,
  });
  const { data: finance } = useCollection("finance", "data", { enabled: isAdmin });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [info, setInfo] = useState("");

  const rows = useMemo(
    () =>
      goals.map((goal) => {
        const metrics = calculateGoalProgress(goal, finance);
        return { ...goal, ...metrics };
      }),
    [goals, finance]
  );

  const openCreate = () => {
    setForm(initialForm);
    setEditing(null);
    setInfo("");
    setOpen(true);
  };

  const openEdit = (goal) => {
    setForm({
      valor: goal.valor,
      termino: toDateInputValue(normalizeDate(goal.termino)),
    });
    setEditing(goal);
    setInfo("");
    setOpen(true);
  };

  const handleSubmit = async () => {
    setInfo("");
    const terminoDate = parseDateInput(form.termino);
    if (!terminoDate) {
      setInfo("Data de termino invalida.");
      return;
    }
    const valor = Number(form.valor || 0);
    if (!Number.isFinite(valor) || valor <= 0) {
      setInfo("Informe o valor da meta.");
      return;
    }

    const payload = {
      valor,
      termino: Timestamp.fromDate(terminoDate),
    };

    try {
      if (!editing) {
        await addDoc(collection(db, "goals"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setOpen(false);
        return;
      }

      await updateDoc(doc(db, "goals", editing.id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      setOpen(false);
    } catch (err) {
      const message = String(err?.message || "");
      if (message.toLowerCase().includes("permission")) {
        setInfo("Sem permissao para salvar metas. Libere a colecao goals no Firestore.");
      } else {
        setInfo("Nao foi possivel salvar a meta.");
      }
    }
  };

  const handleDelete = async (goalId) => {
    try {
      await deleteDoc(doc(db, "goals", goalId));
    } catch (err) {
      const message = String(err?.message || "");
      if (message.toLowerCase().includes("permission")) {
        setInfo("Sem permissao para excluir metas. Libere a colecao goals no Firestore.");
      } else {
        setInfo("Nao foi possivel excluir a meta.");
      }
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Topbar title="Metas" subtitle="Acesso restrito" />
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm text-slate/60">Somente administradores podem visualizar as metas.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Topbar title="Metas" subtitle="Acompanhe metas e projeções mensais" />

      <div className="flex justify-end mb-6">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-white"
        >
          <Plus size={16} />
          Nova meta
        </button>
      </div>

      <p className="text-xs text-slate/60 mb-4">
        O valor realizado usa o faturamento do financeiro no periodo da meta.
      </p>
      {goalsError ? (
        <p className="text-sm text-tide mb-4">
          Nao foi possivel carregar metas. Verifique as permissoes da colecao goals no Firestore.
        </p>
      ) : null}

      <DataTable
        columns={[
          {
            key: "termino",
            label: "Termino",
            render: (row) => formatDate(normalizeDate(row.termino)),
          },
          {
            key: "valor",
            label: "Meta",
            render: (row) => formatCurrency(row.valor),
          },
          {
            key: "progress",
            label: "Realizado",
            render: (row) => formatCurrency(row.progress),
          },
          {
            key: "remaining",
            label: "Restante",
            render: (row) => formatCurrency(row.remaining),
          },
          {
            key: "percent",
            label: "Progresso",
            render: (row) => `${Math.round(row.percent || 0)}%`,
          },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => (
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(row)}
                  className="text-xs uppercase tracking-[0.2em] text-tide"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(row.id)}
                  className="text-xs uppercase tracking-[0.2em] text-red-500"
                >
                  Excluir
                </button>
              </div>
            ),
          },
        ]}
        rows={rows}
        empty="Nenhuma meta registrada."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar meta" : "Nova meta"}
        actions={
          <>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate/60"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              className="rounded-full bg-ink px-5 py-2 text-xs uppercase tracking-[0.2em] text-white"
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="date"
            value={form.termino}
            onChange={(event) => setForm({ ...form, termino: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          />
          <input
            type="number"
            value={form.valor}
            onChange={(event) => setForm({ ...form, valor: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Valor da meta"
          />
        </div>
        {info ? <p className="text-sm text-tide">{info}</p> : null}
      </Modal>
    </Layout>
  );
}
