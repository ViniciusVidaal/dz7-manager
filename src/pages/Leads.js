import React, { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { Plus, ArrowRightCircle } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { ORIGEM_OPTIONS, SERVICE_OPTIONS } from "../utils/constants";
import { requestApproval } from "../utils/approvals";
import { formatCurrency, formatDayMonth, getMonthRef, parseDateInput } from "../utils/format";

const initialForm = {
  nome: "",
  empresa: "",
  telefone: "",
  email: "",
  origem: ORIGEM_OPTIONS[0],
};

const initialConversion = {
  modalidade: "unico",
  formaValorInicial: "integral",
  valorTotal: "",
  valorInicialTotal: "",
  valorInicialPago: "",
  valorInicialSegundaData: "",
  valorRecorrencia: "",
  recorrenciaData: "",
  contratoInicio: "",
  contratoFim: "",
  servicos: [],
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

export default function Leads() {
  const { data: leads } = useCollection("leads", "createdAt");
  const { profile, user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [info, setInfo] = useState("");
  const [search, setSearch] = useState("");

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertLead, setConvertLead] = useState(null);
  const [conversion, setConversion] = useState(initialConversion);
  const [convertInfo, setConvertInfo] = useState("");

  const recurrenceDate = useMemo(
    () => parseDateInput(conversion.recorrenciaData),
    [conversion.recorrenciaData]
  );
  const contractStartDate = useMemo(
    () => parseDateInput(conversion.contratoInicio),
    [conversion.contratoInicio]
  );
  const contractEndDate = useMemo(
    () => parseDateInput(conversion.contratoFim),
    [conversion.contratoFim]
  );
  const secondInitialDate = useMemo(
    () => parseDateInput(conversion.valorInicialSegundaData),
    [conversion.valorInicialSegundaData]
  );
  const isValorInicialParcial = conversion.formaValorInicial === "parcial";
  const valorInicialTotal = useMemo(
    () => parseNumberInput(conversion.valorInicialTotal),
    [conversion.valorInicialTotal]
  );
  const valorInicialPagoInput = useMemo(
    () => parseNumberInput(conversion.valorInicialPago),
    [conversion.valorInicialPago]
  );
  const valorInicialPago = useMemo(
    () => (isValorInicialParcial ? valorInicialPagoInput : valorInicialTotal),
    [isValorInicialParcial, valorInicialPagoInput, valorInicialTotal]
  );
  const valorInicialPendente = useMemo(
    () => Math.max(0, valorInicialTotal - valorInicialPago),
    [valorInicialTotal, valorInicialPago]
  );

  const canCreate = isAdmin || profile?.role === "funcionario";
  const rows = leads;
  const filteredRows = rows.filter((lead) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const nome = String(lead.nome || "").toLowerCase();
    const empresa = String(lead.empresa || "").toLowerCase();
    return nome.includes(term) || empresa.includes(term);
  });

  const openCreate = () => {
    setForm(initialForm);
    setEditing(null);
    setInfo("");
    setOpen(true);
  };

  const openEdit = (lead) => {
    setForm({
      nome: lead.nome || "",
      empresa: lead.empresa || "",
      telefone: lead.telefone || "",
      email: lead.email || "",
      origem: lead.origem || ORIGEM_OPTIONS[0],
    });
    setEditing(lead);
    setInfo("");
    setOpen(true);
  };

  const openConvert = (lead) => {
    setConvertLead(lead);
    setConversion(initialConversion);
    setConvertInfo("");
    setConvertOpen(true);
  };

  const handleSubmit = async () => {
    setInfo("");
    if (!form.nome) {
      setInfo("Nome e obrigatorio.");
      return;
    }

    if (!editing) {
      await addDoc(collection(db, "leads"), {
        ...form,
        status: "lead",
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });
      setOpen(false);
      return;
    }

    if (isAdmin) {
      await updateDoc(doc(db, "leads", editing.id), {
        ...form,
        updatedAt: serverTimestamp(),
      });
      setOpen(false);
      return;
    }

    await requestApproval({
      collectionName: "leads",
      docId: editing.id,
      proposedData: form,
      originalData: editing,
      requestedBy: { uid: user?.uid, name: profile?.nome },
    });
    setInfo("Solicitacao enviada para aprovacao.");
  };

  const handleDelete = async (lead) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(`Excluir ${lead?.nome || "lead"}?`);
    if (!confirmed) return;
    try {
      if (lead?.clientId) {
        const clientRef = doc(db, "clients", lead.clientId);
        const clientSnapshot = await getDoc(clientRef);
        if (clientSnapshot.exists()) {
          await updateDoc(clientRef, {
            leadId: deleteField(),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await deleteDoc(doc(db, "leads", lead.id));
    } catch (error) {
      window.alert("Nao foi possivel excluir o lead agora.");
    }
  };

  const handleConvert = async () => {
    if (!isAdmin) return;
    if (!convertLead) return;
    setConvertInfo("");
    if (conversion.servicos.length === 0) {
      setConvertInfo("Selecione pelo menos um servico contratado.");
      return;
    }

    const now = Timestamp.now();
    const monthRef = getMonthRef(new Date());
    const baseClient = {
      nome: convertLead.nome || "",
      empresa: convertLead.empresa || "",
      telefone: convertLead.telefone || "",
      email: convertLead.email || "",
      origem: convertLead.origem || "",
      quem_converteu: profile?.nome || "",
      servicos_contratados: conversion.servicos,
      leadId: convertLead.id,
      status: "ativo",
      createdAt: serverTimestamp(),
    };

    if (conversion.modalidade === "unico") {
      const valorTotal = parseNumberInput(conversion.valorTotal);
      if (valorTotal <= 0) {
        setConvertInfo("Informe o valor total.");
        return;
      }

      const clientRef = await addDoc(collection(db, "clients"), {
        ...baseClient,
        tipo_contrato: "unico",
        valor_total: valorTotal,
        payments: [
          {
            type: "unico",
            valor: valorTotal,
            date: now,
            monthRef,
          },
        ],
      });

      await addDoc(collection(db, "finance"), {
        data: now,
        valor: valorTotal,
        tipo: "entrada",
        categoria: "Receita Cliente",
        descricao: `Fechamento - Cliente ${convertLead.nome || ""}`,
        clientId: clientRef.id,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "leads", convertLead.id), {
        status: "convertido",
        clientId: clientRef.id,
        convertedAt: serverTimestamp(),
      });

      setConvertOpen(false);
      return;
    }

    const valorInicialTotalValue = parseNumberInput(conversion.valorInicialTotal);
    const valorInicialPagoBase = parseNumberInput(conversion.valorInicialPago);
    const valorInicialPagoValue =
      conversion.formaValorInicial === "parcial" ? valorInicialPagoBase : valorInicialTotalValue;
    const valorRecorrencia = parseNumberInput(conversion.valorRecorrencia);
    const recorrenciaDate = parseDateInput(conversion.recorrenciaData);
    const contratoInicioDate = parseDateInput(conversion.contratoInicio);
    const contratoFimDate = parseDateInput(conversion.contratoFim);
    const segundaParcelaDate =
      conversion.formaValorInicial === "parcial"
        ? parseDateInput(conversion.valorInicialSegundaData)
        : null;
    const valorInicialRestante = Math.max(0, valorInicialTotalValue - valorInicialPagoValue);

    if (!recorrenciaDate) {
      setConvertInfo("Informe a data da recorrencia.");
      return;
    }

    if (!contratoInicioDate) {
      setConvertInfo("Informe a data de inicio do contrato.");
      return;
    }

    if (!contratoFimDate) {
      setConvertInfo("Informe a data final do contrato.");
      return;
    }

    if (contratoFimDate < contratoInicioDate) {
      setConvertInfo("A data final do contrato deve ser depois da data de inicio.");
      return;
    }

    if (recorrenciaDate < contratoInicioDate) {
      setConvertInfo("A recorrencia deve iniciar a partir da data de inicio do contrato.");
      return;
    }

    if (recorrenciaDate > contratoFimDate) {
      setConvertInfo("A recorrencia nao pode iniciar depois da data final do contrato.");
      return;
    }

    if (segundaParcelaDate && segundaParcelaDate > contratoFimDate) {
      setConvertInfo("A segunda parcela do valor inicial nao pode passar da data final do contrato.");
      return;
    }

    const invalidFields = [];
    if (!Number.isFinite(valorInicialTotalValue) || valorInicialTotalValue < 0) {
      invalidFields.push("valor_inicial");
    }
    if (!Number.isFinite(valorInicialPagoValue) || valorInicialPagoValue < 0) {
      invalidFields.push("valor_inicial_pago");
    }
    if (conversion.formaValorInicial === "parcial") {
      if (valorInicialTotalValue <= 0) invalidFields.push("valor_inicial");
      if (!Number.isFinite(valorInicialPagoBase) || valorInicialPagoBase <= 0) {
        invalidFields.push("valor_inicial_pago");
      }
      if (valorInicialPagoBase >= valorInicialTotalValue) {
        invalidFields.push("valor_inicial_pago");
      }
    }
    if (!Number.isFinite(valorRecorrencia) || valorRecorrencia <= 0) invalidFields.push("recorrencia");
    if (conversion.formaValorInicial === "parcial" && !segundaParcelaDate) {
      invalidFields.push("segunda_parcela_data");
    }
    if (invalidFields.length > 0) {
      const labels = {
        valor_inicial: "valor inicial",
        valor_inicial_pago: "valor inicial pago agora",
        recorrencia: "recorrencia",
        segunda_parcela_data: "data da segunda parcela do valor inicial",
      };
      const readable = invalidFields.map((field) => labels[field] || field).join(", ");
      setConvertInfo(`Preencha corretamente: ${readable}.`);
      return;
    }

    const initialPayments = [];
    if (valorInicialPagoValue > 0) {
      initialPayments.push({
        type: "setup",
        valor: valorInicialPagoValue,
        date: now,
        monthRef,
      });
    }

    const clientRef = await addDoc(collection(db, "clients"), {
      ...baseClient,
      tipo_contrato: "recorrente",
      valorInicialForma: conversion.formaValorInicial,
      setupValor: valorInicialTotalValue,
      valorInicialPago: valorInicialPagoValue,
      valorInicialPendente: valorInicialRestante,
      valorInicialSegundaData:
        valorInicialRestante > 0 && segundaParcelaDate ? Timestamp.fromDate(segundaParcelaDate) : null,
      valorInicialSegundaPagaEm: null,
      recorrenciaValor: valorRecorrencia,
      recorrenciaData: Timestamp.fromDate(recorrenciaDate),
      recorrenciaDia: recorrenciaDate.getDate(),
      contratoInicio: Timestamp.fromDate(contratoInicioDate),
      contratoFim: Timestamp.fromDate(contratoFimDate),
      lastPaymentMonth: "",
      payments: initialPayments,
    });

    if (valorInicialPagoValue > 0) {
      await addDoc(collection(db, "finance"), {
        data: now,
        valor: valorInicialPagoValue,
        tipo: "entrada",
        categoria: "Receita Cliente",
        descricao: `Valor inicial - Cliente ${convertLead.nome || ""}`,
        clientId: clientRef.id,
        createdAt: serverTimestamp(),
      });
    }

    await updateDoc(doc(db, "leads", convertLead.id), {
      status: "convertido",
      clientId: clientRef.id,
      convertedAt: serverTimestamp(),
    });

    setConvertOpen(false);
  };

  return (
    <Layout>
      <Topbar title="Leads" subtitle="Contatos em negociacao" />

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex-1 max-w-xl">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Buscar por nome ou empresa..."
          />
        </div>
        {canCreate ? (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-white"
          >
            <Plus size={16} />
            Novo lead
          </button>
        ) : null}
      </div>

      <DataTable
        columns={[
          { key: "nome", label: "Nome" },
          { key: "empresa", label: "Empresa" },
          { key: "telefone", label: "Telefone" },
          { key: "email", label: "Email" },
          { key: "origem", label: "Origem" },
          {
            key: "status",
            label: "Status",
            render: (row) =>
              row.status === "convertido"
                ? "Convertido"
                : "Lead",
          },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openEdit(row)}
                  className="text-xs uppercase tracking-[0.2em] text-tide"
                >
                  {isAdmin ? "Editar" : "Solicitar"}
                </button>
                {isAdmin ? (
                  <button
                    onClick={() => openConvert(row)}
                    disabled={row.status === "convertido"}
                    className={`text-xs uppercase tracking-[0.2em] inline-flex items-center gap-1 ${
                      row.status === "convertido"
                        ? "text-slate/40 cursor-not-allowed"
                        : "text-emerald-600"
                    }`}
                  >
                    <ArrowRightCircle size={12} />
                    {row.status === "convertido" ? "Convertido" : "Converter"}
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
            ),
          },
        ]}
        rows={filteredRows}
        empty="Nenhum lead cadastrado ainda."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar lead" : "Novo lead"}
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
          <select
            value={form.origem}
            onChange={(event) => setForm({ ...form, origem: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            {ORIGEM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {info ? <p className="text-sm text-tide">{info}</p> : null}
      </Modal>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title={`Converter ${convertLead?.nome || ""} em cliente`}
        actions={
          <>
            <button
              onClick={() => setConvertOpen(false)}
              className="rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate/60"
            >
              Cancelar
            </button>
            <button
              onClick={handleConvert}
              className="rounded-full bg-ink px-5 py-2 text-xs uppercase tracking-[0.2em] text-white"
            >
              Confirmar
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-[0.2em] text-slate/60">Tipo de pagamento</label>
            <select
              value={conversion.modalidade}
              onChange={(event) => setConversion({ ...conversion, modalidade: event.target.value })}
              className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            >
              <option value="unico">Pagamento unico</option>
              <option value="recorrente">Pagamento recorrente</option>
            </select>
          </div>

          {conversion.modalidade === "unico" ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                Valor total do contrato
              </label>
              <input
                type="number"
                value={conversion.valorTotal}
                onChange={(event) => setConversion({ ...conversion, valorTotal: event.target.value })}
                className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                placeholder="Ex: 2500"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Valor inicial (total)
                </label>
                <input
                  type="number"
                  value={conversion.valorInicialTotal}
                  onChange={(event) =>
                    setConversion({ ...conversion, valorInicialTotal: event.target.value })
                  }
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                  placeholder="Ex: 500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Pagamento do valor inicial
                </label>
                <select
                  value={conversion.formaValorInicial}
                  onChange={(event) =>
                    setConversion({
                      ...conversion,
                      formaValorInicial: event.target.value,
                      valorInicialSegundaData:
                        event.target.value === "integral" ? "" : conversion.valorInicialSegundaData,
                    })
                  }
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                >
                  <option value="integral">100% pago agora</option>
                  <option value="parcial">Pagamento parcial</option>
                </select>
              </div>
              {isValorInicialParcial ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                      Valor inicial pago agora
                    </label>
                    <input
                      type="number"
                      value={conversion.valorInicialPago}
                      onChange={(event) =>
                        setConversion({ ...conversion, valorInicialPago: event.target.value })
                      }
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
                      value={conversion.valorInicialSegundaData}
                      onChange={(event) =>
                        setConversion({ ...conversion, valorInicialSegundaData: event.target.value })
                      }
                      className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                    Valor inicial pago agora
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={formatCurrency(valorInicialTotal)}
                    className="rounded-2xl border border-slate/20 bg-slate-50 px-4 py-3 text-sm text-slate/80"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Valor da recorrencia
                </label>
                <input
                  type="number"
                  value={conversion.valorRecorrencia}
                  onChange={(event) =>
                    setConversion({ ...conversion, valorRecorrencia: event.target.value })
                  }
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
                  value={conversion.recorrenciaData}
                  onChange={(event) => setConversion({ ...conversion, recorrenciaData: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Data de inicio do contrato
                </label>
                <input
                  type="date"
                  value={conversion.contratoInicio}
                  onChange={(event) => setConversion({ ...conversion, contratoInicio: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-[0.2em] text-slate/60">
                  Data final do contrato
                </label>
                <input
                  type="date"
                  value={conversion.contratoFim}
                  onChange={(event) => setConversion({ ...conversion, contratoFim: event.target.value })}
                  className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-4 text-xs text-slate/60">
          {conversion.modalidade === "unico" ? (
            <p>Esse valor entra imediatamente no financeiro como entrada unica.</p>
          ) : (
            <div className="space-y-1">
              <p>
                {isValorInicialParcial
                  ? "Somente o valor inicial pago agora entra imediatamente no financeiro."
                  : "O valor inicial entra completo no financeiro agora."}
              </p>
              <p>A segunda parcela do valor inicial e a recorrencia entram apenas apos confirmacao.</p>
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate/60 mb-2">Servicos contratados</p>
          <div className="flex flex-wrap gap-3">
            {SERVICE_OPTIONS.map((service) => (
              <label
                key={service}
                className={`px-3 py-2 rounded-full border text-xs cursor-pointer ${
                  conversion.servicos.includes(service)
                    ? "border-tide bg-tide/10 text-tide"
                    : "border-slate/20 text-slate/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={conversion.servicos.includes(service)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...conversion.servicos, service]
                      : conversion.servicos.filter((item) => item !== service);
                    setConversion({ ...conversion, servicos: next });
                  }}
                  className="hidden"
                />
                {service}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 text-sm text-slate/70">
          <p>Resumo:</p>
          {conversion.modalidade === "unico" ? (
            <p className="font-medium">
              Total: {formatCurrency(parseNumberInput(conversion.valorTotal))}
            </p>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">
                Valor inicial total: {formatCurrency(valorInicialTotal)}
              </p>
              <p className="font-medium">
                Valor inicial pago agora: {formatCurrency(valorInicialPago)}
              </p>
              {isValorInicialParcial ? (
                <p className="font-medium">
                  Segunda parcela do valor inicial: {formatCurrency(valorInicialPendente)} (Prev.{" "}
                  {secondInitialDate ? formatDayMonth(secondInitialDate) : "-"})
                </p>
              ) : null}
              <p className="font-medium">
                Valor da recorrencia: {formatCurrency(parseNumberInput(conversion.valorRecorrencia))} (1o venc.{" "}
                {recurrenceDate ? formatDayMonth(recurrenceDate) : "-"})
              </p>
              <p className="font-medium">
                Contrato: {contractStartDate ? formatDayMonth(contractStartDate) : "-"} ate{" "}
                {contractEndDate ? formatDayMonth(contractEndDate) : "-"}
              </p>
            </div>
          )}
        </div>

        {convertInfo ? <p className="text-sm text-tide">{convertInfo}</p> : null}
      </Modal>
    </Layout>
  );
}
