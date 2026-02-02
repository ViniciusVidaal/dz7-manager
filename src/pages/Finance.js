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
import { FINANCE_CATEGORIES } from "../utils/constants";
import { formatCurrency, formatDate, parseDateInput, toDateInputValue } from "../utils/format";
import { normalizeDate } from "../utils/filters";

const initialForm = {
  data: "",
  valor: "",
  tipo: "entrada",
  categoria: FINANCE_CATEGORIES[0],
  descricao: "",
};

export default function Finance() {
  const { isAdmin } = useAuth();
  const { data: finance } = useCollection("finance", "data", { enabled: isAdmin });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [info, setInfo] = useState("");

  const rows = finance;

  const openCreate = () => {
    setForm(initialForm);
    setEditing(null);
    setInfo("");
    setOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      data: toDateInputValue(normalizeDate(item.data)),
      valor: item.valor,
      tipo: item.tipo,
      categoria: item.categoria,
      descricao: item.descricao || "",
    });
    setEditing(item);
    setInfo("");
    setOpen(true);
  };

  const handleSubmit = async () => {
    setInfo("");
    const dateObj = parseDateInput(form.data);
    if (!dateObj) {
      setInfo("Data invalida.");
      return;
    }
    const payload = {
      data: Timestamp.fromDate(dateObj),
      valor: Number(form.valor || 0),
      tipo: form.tipo,
      categoria: form.categoria,
      descricao: form.descricao || "",
    };

    if (!editing) {
      await addDoc(collection(db, "finance"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      setOpen(false);
      return;
    }

    await updateDoc(doc(db, "finance", editing.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    setOpen(false);
  };

  const handleDelete = async (itemId) => {
    await deleteDoc(doc(db, "finance", itemId));
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Topbar title="Financeiro" subtitle="Acesso restrito" />
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm text-slate/60">Somente administradores podem visualizar o financeiro.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Topbar title="Financeiro" subtitle="Lancamentos e controle de caixa" />

      <div className="flex justify-end mb-6">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-white"
        >
          <Plus size={16} />
          Novo lancamento
        </button>
      </div>

      <DataTable
        columns={[
          {
            key: "data",
            label: "Data",
            render: (row) => formatDate(normalizeDate(row.data)),
          },
          {
            key: "valor",
            label: "Valor",
            render: (row) => formatCurrency(row.valor),
          },
          { key: "tipo", label: "Tipo" },
          { key: "categoria", label: "Categoria" },
          { key: "descricao", label: "Descricao" },
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
        empty="Nenhum lancamento registrado."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar lancamento" : "Novo lancamento"}
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
            value={form.data}
            onChange={(event) => setForm({ ...form, data: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          />
          <input
            type="number"
            value={form.valor}
            onChange={(event) => setForm({ ...form, valor: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Valor"
          />
          <input
            value={form.descricao}
            onChange={(event) => setForm({ ...form, descricao: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm md:col-span-2"
            placeholder="Descricao (ex: Mensalidade Jan - Cliente Maria)"
          />
          <select
            value={form.tipo}
            onChange={(event) => setForm({ ...form, tipo: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saida</option>
          </select>
          <select
            value={form.categoria}
            onChange={(event) => setForm({ ...form, categoria: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            {FINANCE_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        {info ? <p className="text-sm text-tide">{info}</p> : null}
      </Modal>
    </Layout>
  );
}
