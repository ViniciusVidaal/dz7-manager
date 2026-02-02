import React, { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, Timestamp } from "firebase/firestore";
import { Plus } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { INVEST_PRIORITIES, INVEST_STATUS } from "../utils/constants";
import { formatCurrency } from "../utils/format";
import { requestApproval } from "../utils/approvals";

const initialForm = {
  nome: "",
  valor: "",
  prioridade: INVEST_PRIORITIES[0],
  status: INVEST_STATUS[0],
};

export default function Investments() {
  const { data: investments } = useCollection("investments", "createdAt");
  const { profile, user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [info, setInfo] = useState("");

  const canCreate = isAdmin || profile?.role === "funcionario";
  const rows = investments;

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
      prioridade: item.prioridade || INVEST_PRIORITIES[0],
      status: item.status || INVEST_STATUS[0],
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

    if (!editing) {
      await addDoc(collection(db, "investments"), {
        ...form,
        valor: Number(form.valor || 0),
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });
      setOpen(false);
      return;
    }

    if (isAdmin) {
      await updateDoc(doc(db, "investments", editing.id), {
        ...form,
        valor: Number(form.valor || 0),
        updatedAt: serverTimestamp(),
      });
      setOpen(false);
      return;
    }

    await requestApproval({
      collectionName: "investments",
      docId: editing.id,
      proposedData: { ...form, valor: Number(form.valor || 0) },
      originalData: editing,
      requestedBy: { uid: user?.uid, name: profile?.nome },
    });
    setInfo("Solicitacao enviada para aprovacao.");
  };

  const handleDelete = async (itemId) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, "investments", itemId));
  };

  const handleAcquire = async (item) => {
    if (!isAdmin) return;
    if (item.status === "concluido") return;
    const valor = Number(item.valor || 0);
    if (!valor || valor <= 0) {
      setInfo("Defina um valor valido antes de adquirir.");
      return;
    }

    const now = Timestamp.now();
    await addDoc(collection(db, "finance"), {
      data: now,
      valor,
      tipo: "saida",
      categoria: "Investimentos",
      descricao: `Investimento - ${item.nome || ""}`,
      investimentoId: item.id,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "investments", item.id), {
      status: "concluido",
      acquiredAt: serverTimestamp(),
      acquiredBy: user?.uid || null,
    });
  };

  return (
    <Layout>
      <Topbar title="Investimentos" subtitle="Projetos estrategicos e prioridades" />

      <div className="flex justify-end mb-6">
        {canCreate ? (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-white"
          >
            <Plus size={16} />
            Novo investimento
          </button>
        ) : null}
      </div>

      <DataTable
        columns={[
          { key: "nome", label: "Nome" },
          {
            key: "valor",
            label: "Valor",
            render: (row) => formatCurrency(row.valor),
          },
          { key: "prioridade", label: "Prioridade" },
          {
            key: "status",
            label: "Status",
            render: (row) => (row.status === "concluido" ? "Adquirido" : "Pendente"),
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
                  {isAdmin ? "Editar" : "Solicitar"}
                </button>
                {isAdmin ? (
                  <button
                    onClick={() => handleAcquire(row)}
                    disabled={row.status === "concluido"}
                    className={`text-xs uppercase tracking-[0.2em] ${
                      row.status === "concluido"
                        ? "text-slate/40 cursor-not-allowed"
                        : "text-emerald-600"
                    }`}
                  >
                    {row.status === "concluido" ? "Adquirido" : "Adquirir"}
                  </button>
                ) : null}
                {isAdmin ? (
                  <button
                    onClick={() => handleDelete(row.id)}
                    className="text-xs uppercase tracking-[0.2em] text-red-500"
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={rows}
        empty="Nenhum investimento registrado."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar investimento" : "Novo investimento"}
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
              {isAdmin || !editing ? "Salvar" : "Solicitar"}
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
          <input
            type="number"
            value={form.valor}
            onChange={(event) => setForm({ ...form, valor: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Valor"
          />
          <select
            value={form.prioridade}
            onChange={(event) => setForm({ ...form, prioridade: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            {INVEST_PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            {INVEST_STATUS.map((option) => (
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
