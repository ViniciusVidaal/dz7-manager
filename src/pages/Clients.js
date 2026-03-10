import React, { useMemo, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { CalendarCheck, Eye } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import {
  formatCurrency,
  formatDate,
  formatDayMonth,
  getMonthRef,
  parseDateInput,
  toDateInputValue,
} from "../utils/format";
import { normalizeDate } from "../utils/filters";
import { requestApproval } from "../utils/approvals";
import { SERVICE_OPTIONS } from "../utils/constants";
import { getNextRecurringDate } from "../utils/recurrence";

const initialForm = {
  nome: "",
  empresa: "",
  telefone: "",
  email: "",
  servicos: [],
  valorTotal: "",
  setupValor: "",
  valorInicialPago: "",
  valorInicialSegundaData: "",
  recorrenciaValor: "",
  recorrenciaData: "",
  contratoInicio: "",
  contratoFim: "",
};

const parseNumberInput = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  if (raw.includes(",")) {
    const normalized = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    return Number(normalized);
  }
  const normalized = raw.replace(/[^\d.-]/g, "");
  return Number(normalized);
};

const INITIAL_PAYMENT_TYPES = ["setup", "setup_parcela2", "valor_inicial", "valor_inicial_parcela2"];

const sumInitialPayments = (payments = []) =>
  payments.reduce((acc, payment) => {
    if (!INITIAL_PAYMENT_TYPES.includes(payment?.type)) return acc;
    return acc + Number(payment?.valor || 0);
  }, 0);

const getInitialPaidValue = (client) => {
  const explicitPaid = Number(client?.valorInicialPago);
  if (Number.isFinite(explicitPaid) && explicitPaid >= 0) return explicitPaid;

  const paymentSum = sumInitialPayments(client?.payments || []);
  if (paymentSum > 0) return paymentSum;

  const total = Number(client?.setupValor || 0);
  return total > 0 ? total : 0;
};

const getInitialPendingValue = (client) => {
  const explicitPending = Number(client?.valorInicialPendente);
  if (Number.isFinite(explicitPending) && explicitPending >= 0) return explicitPending;

  const total = Number(client?.setupValor || 0);
  if (!Number.isFinite(total) || total <= 0) return 0;

  return Math.max(0, total - getInitialPaidValue(client));
};

const getWhatsAppLink = (phoneValue) => {
  const digits = String(phoneValue || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return `https://wa.me/${digits}`;
  if (digits.length === 10 || digits.length === 11) return `https://wa.me/55${digits}`;
  return `https://wa.me/${digits}`;
};


export default function Clients() {
  const { data: clients } = useCollection("clients", "createdAt");
  const { profile, user, isAdmin } = useAuth();
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editInfo, setEditInfo] = useState("");

  const now = new Date();
  const currentMonth = getMonthRef(now);
  const canEdit = isAdmin;

  const contractStartDate = useMemo(
    () => parseDateInput(form.contratoInicio),
    [form.contratoInicio]
  );
  const contractEndDate = useMemo(
    () => parseDateInput(form.contratoFim),
    [form.contratoFim]
  );
  const valorInicialTotal = useMemo(
    () => parseNumberInput(form.setupValor),
    [form.setupValor]
  );
  const valorInicialPago = useMemo(
    () => parseNumberInput(form.valorInicialPago),
    [form.valorInicialPago]
  );
  const valorInicialPendente = useMemo(
    () => Math.max(0, valorInicialTotal - valorInicialPago),
    [valorInicialTotal, valorInicialPago]
  );

  const recurringClients = useMemo(
    () => clients.filter((client) => client.tipo_contrato === "recorrente"),
    [clients]
  );

  const dueToday = recurringClients.filter((client) => {
    const dueDate = getNextRecurringDate(client, now);
    if (!dueDate) return false;
    const dueMonthRef = getMonthRef(dueDate);
    if (client.lastPaymentMonth === dueMonthRef) return false;
    return dueDate.toDateString() === now.toDateString();
  });

  const dueSoon = recurringClients.filter((client) => {
    const dueDate = getNextRecurringDate(client, now);
    if (!dueDate) return false;
    const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    const dueMonthRef = getMonthRef(dueDate);
    if (client.lastPaymentMonth === dueMonthRef) return false;
    if (dueMonthRef !== currentMonth) return false;
    return diffDays >= 0 && diffDays <= 30;
  });

  const receivableSoon = dueSoon.reduce((acc, client) => acc + Number(client.recorrenciaValor || 0), 0);

  const handleConfirm = async (client) => {
    if (!client.recorrenciaValor) return;
    const dueDate = getNextRecurringDate(client, now);
    if (!dueDate) return;
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

  const handleConfirmInitialInstallment = async (client) => {
    const pendingValue = getInitialPendingValue(client);
    if (pendingValue <= 0) return;

    const currentPaid = getInitialPaidValue(client);
    const nowTimestamp = Timestamp.now();
    await addDoc(collection(db, "finance"), {
      data: nowTimestamp,
      valor: pendingValue,
      tipo: "entrada",
      categoria: "Receita Cliente",
      descricao: `2a parcela valor inicial - Cliente ${client.nome || ""}`,
      clientId: client.id,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "clients", client.id), {
      valorInicialPago: currentPaid + pendingValue,
      valorInicialPendente: 0,
      valorInicialSegundaPagaEm: nowTimestamp,
      payments: arrayUnion({
        type: "setup_parcela2",
        valor: pendingValue,
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

    try {
      const batch = writeBatch(db);

      if (client.leadId) {
        const leadRef = doc(db, "leads", client.leadId);
        const leadSnapshot = await getDoc(leadRef);
        if (leadSnapshot.exists()) {
          batch.update(leadRef, {
            status: "lead",
            clientId: deleteField(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      const financeRef = collection(db, "finance");
      const financeQuery = query(financeRef, where("clientId", "==", client.id));
      const financeSnapshot = await getDocs(financeQuery);
      financeSnapshot.forEach((financeDoc) => {
        batch.delete(financeDoc.ref);
      });

      batch.delete(doc(db, "clients", client.id));
      await batch.commit();
    } catch (error) {
      window.alert("Nao foi possivel excluir o cliente agora.");
    }
  };

  const openEdit = (client) => {
    const startDate = normalizeDate(client.contratoInicio);
    const endDate = normalizeDate(client.contratoFim);
    const recurrenceBase = normalizeDate(client.recorrenciaData);
    const secondInstallmentDate = normalizeDate(client.valorInicialSegundaData);
    const fallbackRecurrence = recurrenceBase || getNextRecurringDate(client, now);
    const initialPaid = getInitialPaidValue(client);

    setForm({
      nome: client.nome || "",
      empresa: client.empresa || "",
      telefone: client.telefone || "",
      email: client.email || "",
      servicos: client.servicos_contratados || [],
      valorTotal: client.valor_total ?? "",
      setupValor: client.setupValor ?? "",
      valorInicialPago: initialPaid > 0 ? initialPaid : "",
      valorInicialSegundaData: secondInstallmentDate ? toDateInputValue(secondInstallmentDate) : "",
      recorrenciaValor: client.recorrenciaValor ?? "",
      recorrenciaData: fallbackRecurrence ? toDateInputValue(fallbackRecurrence) : "",
      contratoInicio: startDate ? toDateInputValue(startDate) : "",
      contratoFim: endDate ? toDateInputValue(endDate) : "",
    });
    setEditing(client);
    setEditInfo("");
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setEditInfo("");
    if (!form.nome) {
      setEditInfo("Nome e obrigatorio.");
      return;
    }

    const baseData = {
      nome: form.nome,
      empresa: form.empresa,
      telefone: form.telefone,
      email: form.email,
      servicos_contratados: form.servicos || [],
    };

    if (editing.tipo_contrato === "unico") {
      const valorTotal = parseNumberInput(form.valorTotal);
      if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
        setEditInfo("Informe o valor total.");
        return;
      }

      const payload = { ...baseData, valor_total: valorTotal };
      if (isAdmin) {
        await updateDoc(doc(db, "clients", editing.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        setEditOpen(false);
        return;
      }

      await requestApproval({
        collectionName: "clients",
        docId: editing.id,
        proposedData: payload,
        originalData: editing,
        requestedBy: { uid: user?.uid, name: profile?.nome },
      });
      setEditInfo("Solicitacao enviada para aprovacao.");
      return;
    }

    const valorSetup = parseNumberInput(form.setupValor);
    const valorInicialPagoForm = parseNumberInput(form.valorInicialPago);
    const valorRecorrencia = parseNumberInput(form.recorrenciaValor);
    const recorrenciaDate = parseDateInput(form.recorrenciaData);
    const segundaParcelaDate = parseDateInput(form.valorInicialSegundaData);
    const valorInicialRestante = Math.max(0, valorSetup - valorInicialPagoForm);

    if (!contractStartDate) {
      setEditInfo("Informe o inicio do contrato.");
      return;
    }

    if (!contractEndDate) {
      setEditInfo("Defina o termino do contrato.");
      return;
    }

    if (contractEndDate < contractStartDate) {
      setEditInfo("O termino do contrato deve ser depois do inicio.");
      return;
    }

    if (!recorrenciaDate) {
      setEditInfo("Informe a data da recorrencia.");
      return;
    }

    if (recorrenciaDate < contractStartDate) {
      setEditInfo("A recorrencia deve iniciar a partir da data de inicio do contrato.");
      return;
    }

    if (recorrenciaDate > contractEndDate) {
      setEditInfo("A recorrencia nao pode iniciar depois da data final do contrato.");
      return;
    }

    if (segundaParcelaDate && segundaParcelaDate > contractEndDate) {
      setEditInfo("A segunda parcela do valor inicial nao pode passar da data final do contrato.");
      return;
    }

    const invalidFields = [];
    if (!Number.isFinite(valorSetup) || valorSetup < 0) invalidFields.push("valor_inicial");
    if (!Number.isFinite(valorInicialPagoForm) || valorInicialPagoForm < 0) {
      invalidFields.push("valor_inicial_pago");
    }
    if (valorInicialPagoForm > valorSetup) invalidFields.push("valor_inicial_pago");
    if (!Number.isFinite(valorRecorrencia) || valorRecorrencia <= 0) invalidFields.push("recorrencia");
    if (valorInicialRestante > 0 && !segundaParcelaDate) invalidFields.push("segunda_parcela_data");
    if (invalidFields.length > 0) {
      const labels = {
        valor_inicial: "valor inicial",
        valor_inicial_pago: "valor inicial pago agora",
        recorrencia: "recorrencia",
        segunda_parcela_data: "data da segunda parcela do valor inicial",
      };
      const readable = invalidFields.map((field) => labels[field] || field).join(", ");
      setEditInfo(`Preencha corretamente: ${readable}.`);
      return;
    }

    const payload = {
      ...baseData,
      setupValor: valorSetup,
      valorInicialPago: valorInicialPagoForm,
      valorInicialPendente: valorInicialRestante,
      valorInicialSegundaData:
        valorInicialRestante > 0 && segundaParcelaDate ? Timestamp.fromDate(segundaParcelaDate) : null,
      recorrenciaValor: valorRecorrencia,
      recorrenciaData: Timestamp.fromDate(recorrenciaDate),
      recorrenciaDia: recorrenciaDate.getDate(),
      contratoInicio: Timestamp.fromDate(contractStartDate),
      contratoFim: Timestamp.fromDate(contractEndDate),
    };

    if (isAdmin) {
      await updateDoc(doc(db, "clients", editing.id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      setEditOpen(false);
      return;
    }

    await requestApproval({
      collectionName: "clients",
      docId: editing.id,
      proposedData: payload,
      originalData: editing,
      requestedBy: { uid: user?.uid, name: profile?.nome },
    });
    setEditInfo("Solicitacao enviada para aprovacao.");
  };

  const rows = clients;
  const filteredRows = rows.filter((client) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const nome = String(client.nome || "").toLowerCase();
    const empresa = String(client.empresa || "").toLowerCase();
    return nome.includes(term) || empresa.includes(term);
  });

  if (!isAdmin) {
    return (
      <Layout>
        <Topbar title="Clientes" subtitle="Acesso restrito" />
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm text-slate/60">Somente administradores podem acessar Clientes.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Topbar title="Clientes" subtitle="Controle de contratos e mensalidades" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60">Receber nos proximos 30 dias</p>
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
          {
            key: "telefone",
            label: "Telefone",
            render: (row) => {
              const phone = row.telefone || "";
              const link = getWhatsAppLink(phone);
              if (!link) return "-";
              return (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-tide hover:underline"
                  title="Abrir conversa no WhatsApp"
                >
                  {phone}
                </a>
              );
            },
          },
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
            render: (row) => {
              if (row.tipo_contrato !== "recorrente") {
                return "Pagamento unico";
              }
              return formatCurrency(row.recorrenciaValor);
            },
          },
          {
            key: "valor_inicial",
            label: "Valor inicial",
            render: (row) => {
              if (row.tipo_contrato !== "recorrente") return "-";
              const totalValue = Number(row.setupValor || 0);
              if (totalValue <= 0) return "Sem valor inicial";
              const pending = getInitialPendingValue(row);
              const secondDate = normalizeDate(row.valorInicialSegundaData);
              if (pending <= 0) return `${formatCurrency(totalValue)} (quitado)`;
              return `${formatCurrency(totalValue)} (pendente ${formatCurrency(pending)} ate ${
                secondDate ? formatDayMonth(secondDate) : "-"
              })`;
            },
          },
          {
            key: "status",
            label: "Status",
            render: (row) => {
              if (row.tipo_contrato !== "recorrente") {
                return "Unico";
              }
              if (row.lastPaymentMonth === currentMonth) {
                return "Pago";
              }
              const dueDate = getNextRecurringDate(row, now);
              if (!dueDate) {
                return "Sem vencimento";
              }
              const dueMonthRef = getMonthRef(dueDate);
              if (row.lastPaymentMonth === dueMonthRef) {
                return "Pago";
              }
              return `A vencer ${formatDayMonth(dueDate)}`;
            },
          },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => {
              const dueDate = getNextRecurringDate(row, now);
              const dueMonthRef = dueDate ? getMonthRef(dueDate) : "";
              const canConfirm =
                isAdmin &&
                row.tipo_contrato === "recorrente" &&
                dueMonthRef === currentMonth &&
                row.lastPaymentMonth !== currentMonth;
              const canConfirmInitial =
                isAdmin &&
                row.tipo_contrato === "recorrente" &&
                getInitialPendingValue(row) > 0;

              return (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelected(row)}
                    className="text-xs uppercase tracking-[0.2em] text-tide inline-flex items-center gap-1"
                  >
                    <Eye size={12} />
                    Historico
                  </button>
                  {canEdit ? (
                    <button
                      onClick={() => openEdit(row)}
                      className="text-xs uppercase tracking-[0.2em] text-tide"
                    >
                      {isAdmin ? "Editar" : "Solicitar"}
                    </button>
                  ) : null}
                  {canConfirmInitial ? (
                    <button
                      onClick={() => handleConfirmInitialInstallment(row)}
                      className="text-xs uppercase tracking-[0.2em] text-emerald-600"
                    >
                      Confirmar 2a parcela inicial
                    </button>
                  ) : null}
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
              <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Valor da recorrencia</p>
              <p>
                {selected?.tipo_contrato === "recorrente"
                  ? formatCurrency(selected?.recorrenciaValor)
                  : "Pagamento unico"}
              </p>
            </div>
            {selected?.tipo_contrato === "recorrente" ? (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Valor inicial</p>
                <p>
                  {formatCurrency(selected?.setupValor)} | Pendente{" "}
                  {formatCurrency(getInitialPendingValue(selected))}
                </p>
              </div>
            ) : null}
            {selected?.tipo_contrato === "recorrente" ? (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Vigencia do contrato</p>
                <p>
                  {formatDate(normalizeDate(selected?.contratoInicio))} ate{" "}
                  {formatDate(normalizeDate(selected?.contratoFim))}
                </p>
              </div>
            ) : null}
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
                            ? "Valor inicial"
                            : payment.type === "setup_parcela2"
                              ? "2a parcela do valor inicial"
                              : payment.type === "valor_inicial"
                                ? "Valor inicial"
                                : payment.type === "valor_inicial_parcela2"
                                  ? "2a parcela do valor inicial"
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

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Editar cliente - ${editing?.nome || ""}`}
        actions={
          <>
            <button
              onClick={() => setEditOpen(false)}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate/60"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpdate}
              className="rounded-full bg-ink px-5 py-2 text-xs uppercase tracking-[0.2em] text-white"
            >
              {isAdmin ? "Salvar" : "Solicitar"}
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
            value={form.empresa}
            onChange={(event) => setForm({ ...form, empresa: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Empresa"
          />
          <input
            value={form.telefone}
            onChange={(event) => setForm({ ...form, telefone: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Telefone"
          />
          <input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Email"
          />
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60 mb-2">Servicos contratados</p>
          <div className="flex flex-wrap gap-3">
            {SERVICE_OPTIONS.map((service) => (
              <label
                key={service}
                className={`px-3 py-2 rounded-full border text-xs cursor-pointer ${
                  form.servicos.includes(service)
                    ? "border-tide bg-tide/10 text-tide"
                    : "border-slate/20 text-slate/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.servicos.includes(service)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...form.servicos, service]
                      : form.servicos.filter((item) => item !== service);
                    setForm({ ...form, servicos: next });
                  }}
                  className="hidden"
                />
                {service}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60 mb-2">Contrato</p>
          {editing?.tipo_contrato === "unico" ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Valor total do contrato
                </label>
                <input
                  type="number"
                  value={form.valorTotal}
                  onChange={(event) => setForm({ ...form, valorTotal: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                  placeholder="Ex: 2500"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Valor inicial (total)
                </label>
                <input
                  type="number"
                  value={form.setupValor}
                  onChange={(event) => setForm({ ...form, setupValor: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                  placeholder="Ex: 500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Valor inicial pago agora
                </label>
                <input
                  type="number"
                  value={form.valorInicialPago}
                  onChange={(event) => setForm({ ...form, valorInicialPago: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                  placeholder="Ex: 250"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Segunda parcela do valor inicial
                </label>
                <input
                  type="text"
                  readOnly
                  value={formatCurrency(valorInicialPendente)}
                  className="rounded-2xl border border-slate/20 bg-slate-50 px-4 py-3 text-sm text-slate/80"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Data da segunda parcela
                </label>
                <input
                  type="date"
                  value={form.valorInicialSegundaData}
                  onChange={(event) => setForm({ ...form, valorInicialSegundaData: event.target.value })}
                  disabled={valorInicialPendente <= 0}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Valor da recorrencia
                </label>
                <input
                  type="number"
                  value={form.recorrenciaValor}
                  onChange={(event) => setForm({ ...form, recorrenciaValor: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                  placeholder="Ex: 300"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Primeiro vencimento da recorrencia
                </label>
                <input
                  type="date"
                  value={form.recorrenciaData}
                  onChange={(event) => setForm({ ...form, recorrenciaData: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Data de inicio do contrato
                </label>
                <input
                  type="date"
                  value={form.contratoInicio}
                  onChange={(event) => setForm({ ...form, contratoInicio: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Data final do contrato
                </label>
                <input
                  type="date"
                  value={form.contratoFim}
                  onChange={(event) => setForm({ ...form, contratoFim: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {editInfo ? <p className="text-sm text-tide">{editInfo}</p> : null}
      </Modal>
    </Layout>
  );
}
