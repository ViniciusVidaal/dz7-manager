import React, { useState } from "react";
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
  nome: "",
  valor: "",
  vencimento: "",
  ultimos4: "",
  tipo: "recorrente",
};

const getNextDueDate = (date) => {
  const current = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(current.getTime())) return null;
  const year = current.getFullYear();
  const month = current.getMonth();
  const day = current.getDate();
  const nextMonth = month + 1;
  const lastDay = new Date(year, nextMonth + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(year, nextMonth, safeDay);
};

export default function Tools() {
  const { isAdmin } = useAuth();
  const { data: tools } = useCollection("tools", "vencimento", { enabled: isAdmin });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [info, setInfo] = useState("");

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const cutoffPast = new Date(startOfToday);
  cutoffPast.setDate(cutoffPast.getDate() - 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  const rows = tools.filter((tool) => {
    if (tool.status === "concluido") return false;
    const due = normalizeDate(tool.vencimento);
    if (!due) return false;
    return due <= endOfMonth && due >= cutoffPast;
  });

  const openCreate = () => {
    setForm(initialForm);
    setEditing(null);
    setInfo("");
    setOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      nome: item.nome || "",
      valor: item.valor,
      vencimento: toDateInputValue(normalizeDate(item.vencimento)),
      ultimos4: item.ultimos4 || "",
      tipo: item.tipo === "unico" ? "unico" : "recorrente",
    });
    setEditing(item);
    setInfo("");
    setOpen(true);
  };

  const handleSubmit = async () => {
    setInfo("");
    if (!form.nome) {
      setInfo("Nome e obrigatorio.");
      return;
    }
    const vencimentoDate = parseDateInput(form.vencimento);
    if (!vencimentoDate) {
      setInfo("Vencimento invalido.");
      return;
    }
    const payload = {
      nome: form.nome,
      valor: Number(form.valor || 0),
      vencimento: Timestamp.fromDate(vencimentoDate),
      ultimos4: form.ultimos4,
      tipo: form.tipo === "unico" ? "unico" : "recorrente",
    };

    if (!editing) {
      await addDoc(collection(db, "tools"), {
        ...payload,
        status: "ativo",
        createdAt: serverTimestamp(),
      });
      setOpen(false);
      return;
    }

    await updateDoc(doc(db, "tools", editing.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    setOpen(false);
  };

  const handleDelete = async (itemId) => {
    await deleteDoc(doc(db, "tools", itemId));
  };

  const handlePaid = async (item) => {
    if (!isAdmin) return;
    if (item.status === "concluido") {
      setInfo("Este pagamento ja foi concluido.");
      return;
    }
    const vencimentoDate = normalizeDate(item.vencimento);
    if (!vencimentoDate) {
      setInfo("Vencimento invalido.");
      return;
    }
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (vencimentoDate > endOfToday) {
      setInfo("Este pagamento ainda nao venceu.");
      return;
    }

    const now = Timestamp.now();
    const valor = Number(item.valor || 0);
    if (!valor || valor <= 0) {
      setInfo("Defina um valor valido antes de marcar como pago.");
      return;
    }

    await addDoc(collection(db, "finance"), {
      data: now,
      valor,
      tipo: "saida",
      categoria: "Ferramentas",
      descricao: `Ferramenta - ${item.nome || ""}`,
      toolId: item.id,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "tools", item.id), {
      lastPaidAt: serverTimestamp(),
      ...(item.tipo === "unico"
        ? {
            status: "concluido",
            paidAt: serverTimestamp(),
          }
        : {
            vencimento: (() => {
              const nextDue = getNextDueDate(vencimentoDate);
              return nextDue ? Timestamp.fromDate(nextDue) : item.vencimento;
            })(),
          }),
      updatedAt: serverTimestamp(),
    });
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Topbar title="Ferramentas" subtitle="Acesso restrito" />
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm text-slate/60">Somente administradores podem visualizar as ferramentas.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Topbar title="Ferramentas" subtitle="Assinaturas e vencimentos" />

      <div className="flex justify-end mb-6">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-white"
        >
          <Plus size={16} />
          Nova ferramenta
        </button>
      </div>
      <p className="text-xs text-slate/60 mb-4">
        Exibindo vencimentos ate o fim do mes atual e ate 1 dia apos vencer.
      </p>

      <DataTable
        columns={[
          { key: "nome", label: "Nome" },
          {
            key: "tipo",
            label: "Tipo",
            render: (row) => (row.tipo === "unico" ? "Unico" : "Recorrente"),
          },
          {
            key: "valor",
            label: "Valor",
            render: (row) => formatCurrency(row.valor),
          },
          {
            key: "vencimento",
            label: "Vencimento",
            render: (row) => formatDate(normalizeDate(row.vencimento)),
          },
          {
            key: "status",
            label: "Status",
            render: (row) => {
              if (row.status === "concluido") return "Pago";
              const due = normalizeDate(row.vencimento);
              if (!due) return "Sem vencimento";
              const endOfToday = new Date();
              endOfToday.setHours(23, 59, 59, 999);
              return due <= endOfToday ? "Vencido" : "Em dia";
            },
          },
          { key: "ultimos4", label: "Cartao" },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => (
              <div className="flex gap-2">
                <button
                  onClick={() => handlePaid(row)}
                  className="text-xs uppercase tracking-[0.2em] text-emerald-600"
                >
                  Marcar pago
                </button>
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
        empty="Nenhuma ferramenta para este mes."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar ferramenta" : "Nova ferramenta"}
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
            value={form.nome}
            onChange={(event) => setForm({ ...form, nome: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Nome"
          />
          <select
            value={form.tipo}
            onChange={(event) => setForm({ ...form, tipo: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            <option value="recorrente">Pagamento recorrente</option>
            <option value="unico">Pagamento unico</option>
          </select>
          <input
            type="number"
            value={form.valor}
            onChange={(event) => setForm({ ...form, valor: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Valor"
          />
          <input
            type="date"
            value={form.vencimento}
            onChange={(event) => setForm({ ...form, vencimento: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          />
          <input
            value={form.ultimos4}
            onChange={(event) => setForm({ ...form, ultimos4: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Ultimos 4 digitos"
          />
        </div>
        {info ? <p className="text-sm text-tide">{info}</p> : null}
      </Modal>
    </Layout>
  );
}
