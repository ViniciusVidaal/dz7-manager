import React, { useMemo, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { CalendarCheck, Eye } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDate, getMonthRef } from "../utils/format";
import { normalizeDate } from "../utils/filters";

const getDueDateForMonth = (year, month, day) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(year, month, safeDay);
};

const getNextDueDate = (day) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayStart = new Date(year, month, now.getDate());
  const thisMonthDue = getDueDateForMonth(year, month, day);
  if (thisMonthDue >= todayStart) {
    return thisMonthDue;
  }
  return getDueDateForMonth(year, month + 1, day);
};

export default function Clients() {
  const { data: clients } = useCollection("clients", "createdAt");
  const { isAdmin } = useAuth();
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  const now = new Date();
  const currentMonth = getMonthRef(now);

  const recurringClients = useMemo(
    () => clients.filter((client) => client.tipo_contrato === "recorrente"),
    [clients]
  );

  const dueToday = recurringClients.filter((client) => {
    if (!client.recorrenciaDia) return false;
    const dueDate = getNextDueDate(client.recorrenciaDia);
    const dueMonthRef = getMonthRef(dueDate);
    if (client.lastPaymentMonth === dueMonthRef) return false;
    return dueDate.toDateString() === now.toDateString();
  });

  const dueSoon = recurringClients.filter((client) => {
    if (!client.recorrenciaDia) return false;
    const dueDate = getNextDueDate(client.recorrenciaDia);
    const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    const dueMonthRef = getMonthRef(dueDate);
    if (client.lastPaymentMonth === dueMonthRef) return false;
    return diffDays >= 0 && diffDays <= 10;
  });

  const receivableSoon = dueSoon.reduce((acc, client) => acc + Number(client.recorrenciaValor || 0), 0);

  const handleConfirm = async (client) => {
    if (!client.recorrenciaValor || !client.recorrenciaDia) return;
    const dueDate = getNextDueDate(client.recorrenciaDia);
    const dueMonthRef = getMonthRef(dueDate);
    if (dueMonthRef !== currentMonth) {
      return;
    }
    if (client.lastPaymentMonth === currentMonth) return;

    const nowTimestamp = Timestamp.now();
    await addDoc(collection(db, "finance"), {
      data: nowTimestamp,
      valor: Number(client.recorrenciaValor || 0),
      tipo: "entrada",
      categoria: "Receita Cliente",
      descricao: `Mensalidade ${currentMonth} - Cliente ${client.nome || ""}`,
      clientId: client.id,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "clients", client.id), {
      lastPaymentMonth: currentMonth,
      payments: arrayUnion({
        type: "mensalidade",
        valor: Number(client.recorrenciaValor || 0),
        date: nowTimestamp,
        monthRef: currentMonth,
      }),
      updatedAt: serverTimestamp(),
    });
  };

  const handleDelete = async (client) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      `Excluir ${client.nome || "cliente"}? Ele voltara a ficar como lead.`
    );
    if (!confirmed) return;

    if (client.leadId) {
      await updateDoc(doc(db, "leads", client.leadId), {
        status: "lead",
        clientId: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }

    await deleteDoc(doc(db, "clients", client.id));
  };

  const rows = clients;
  const filteredRows = rows.filter((client) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const nome = String(client.nome || "").toLowerCase();
    const empresa = String(client.empresa || "").toLowerCase();
    return nome.includes(term) || empresa.includes(term);
  });

  return (
    <Layout>
      <Topbar title="Clientes" subtitle="Controle de contratos e mensalidades" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60">Receber nos proximos 10 dias</p>
          <h3 className="text-3xl font-display text-slate mt-3">{formatCurrency(receivableSoon)}</h3>
          <p className="text-sm text-slate/60 mt-2">{dueSoon.length} clientes recorrentes</p>
        </div>
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60">Vencimentos hoje</p>
          {dueToday.length === 0 ? (
            <p className="text-sm text-slate/60 mt-3">Nenhum vencimento hoje.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {dueToday.map((client) => (
                <div key={client.id} className="flex items-center justify-between text-sm">
                  <span>{client.nome}</span>
                  <span className="text-slate/60">{formatCurrency(client.recorrenciaValor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60">Recorrentes ativos</p>
          <h3 className="text-3xl font-display text-slate mt-3">{recurringClients.length}</h3>
          <p className="text-sm text-slate/60 mt-2">Clientes com mensalidade</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex-1 max-w-xl">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Buscar por nome ou empresa..."
          />
        </div>
      </div>

      <DataTable
        columns={[
          { key: "nome", label: "Nome" },
          { key: "empresa", label: "Empresa" },
          { key: "email", label: "Email" },
          {
            key: "servicos_contratados",
            label: "Servicos",
            render: (row) => (row.servicos_contratados || []).join(", "),
          },
          {
            key: "tipo_contrato",
            label: "Contrato",
          },
          {
            key: "recorrencia",
            label: "Recorrencia",
            render: (row) =>
              row.tipo_contrato === "recorrente"
                ? `${formatCurrency(row.recorrenciaValor)} (Dia ${row.recorrenciaDia || "-"})`
                : "Pagamento unico",
          },
          {
            key: "status",
            label: "Status",
            render: (row) => {
              if (row.tipo_contrato !== "recorrente") {
                return "Unico";
              }
              const dueDate = getNextDueDate(row.recorrenciaDia || 1);
              if (row.lastPaymentMonth === currentMonth) {
                return "Pago mes atual";
              }
              return `A vencer dia ${dueDate.getDate()}`;
            },
          },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => {
              const dueDate = row.recorrenciaDia ? getNextDueDate(row.recorrenciaDia) : null;
              const dueMonthRef = dueDate ? getMonthRef(dueDate) : "";
              const canConfirm =
                isAdmin &&
                row.tipo_contrato === "recorrente" &&
                dueMonthRef === currentMonth &&
                row.lastPaymentMonth !== currentMonth;

              return (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelected(row)}
                    className="text-xs uppercase tracking-[0.2em] text-tide inline-flex items-center gap-1"
                  >
                    <Eye size={12} />
                    Historico
                  </button>
                  {canConfirm ? (
                    <button
                      onClick={() => handleConfirm(row)}
                      className="text-xs uppercase tracking-[0.2em] text-emerald-600 inline-flex items-center gap-1"
                    >
                      <CalendarCheck size={12} />
                      Confirmar mes
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <button
                      onClick={() => handleDelete(row)}
                      className="text-xs uppercase tracking-[0.2em] text-red-500"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              );
            },
          },
        ]}
        rows={filteredRows}
        empty="Nenhum cliente cadastrado ainda."
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`Historico - ${selected?.nome || ""}`}
      >
        <div className="space-y-4 text-sm text-slate/70">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Contrato</p>
              <p>{selected?.tipo_contrato}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Recorrencia</p>
              <p>
                {selected?.tipo_contrato === "recorrente"
                  ? `${formatCurrency(selected?.recorrenciaValor)} (Dia ${selected?.recorrenciaDia || "-"})`
                  : "Pagamento unico"}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Servicos contratados</p>
              <p>{(selected?.servicos_contratados || []).join(", ") || "Nao informado"}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate/50 mb-2">Pagamentos</p>
            {selected?.payments && selected.payments.length > 0 ? (
              <div className="space-y-2">
                {[...selected.payments]
                  .sort((a, b) => {
                    const aDate = normalizeDate(a.date);
                    const bDate = normalizeDate(b.date);
                    return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
                  })
                  .map((payment, index) => (
                    <div
                      key={`${payment.type}-${index}`}
                      className="flex items-center justify-between rounded-2xl border border-slate/10 bg-white/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm text-slate">
                          {payment.type === "setup"
                            ? "Setup"
                            : payment.type === "mensalidade"
                              ? `Mensalidade ${payment.monthRef || ""}`
                              : "Pagamento unico"}
                        </p>
                        <p className="text-xs text-slate/60">{formatDate(normalizeDate(payment.date))}</p>
                      </div>
                      <span className="text-sm font-medium text-slate">
                        {formatCurrency(payment.valor)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-slate/60">Sem pagamentos registrados.</p>
            )}
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
