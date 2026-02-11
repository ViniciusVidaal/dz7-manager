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
  valorTotal: "",
  valorSetup: "",
  valorRecorrencia: "",
  recorrenciaData: "",
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

  const handleDelete = async (leadId) => {
    if (!isAdmin) return;
    await deleteDoc(doc(db, "leads", leadId));
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

    const valorSetup = parseNumberInput(conversion.valorSetup);
    const valorRecorrencia = parseNumberInput(conversion.valorRecorrencia);
    const recorrenciaDate = parseDateInput(conversion.recorrenciaData);

    if (!recorrenciaDate) {
      setConvertInfo("Informe a data da recorrencia.");
      return;
    }

    const invalidFields = [];
    if (!Number.isFinite(valorSetup) || valorSetup < 0) invalidFields.push("setup");
    if (!Number.isFinite(valorRecorrencia) || valorRecorrencia <= 0) invalidFields.push("recorrencia");
    if (invalidFields.length > 0) {
      const labels = {
        setup: "setup",
        recorrencia: "recorrencia",
      };
      const readable = invalidFields.map((field) => labels[field] || field).join(", ");
      setConvertInfo(`Preencha corretamente: ${readable}.`);
      return;
    }

    const clientRef = await addDoc(collection(db, "clients"), {
      ...baseClient,
      tipo_contrato: "recorrente",
      setupValor: valorSetup,
      recorrenciaValor: valorRecorrencia,
      recorrenciaData: Timestamp.fromDate(recorrenciaDate),
      recorrenciaDia: recorrenciaDate.getDate(),
      lastPaymentMonth: "",
      payments: [
        {
          type: "setup",
          valor: valorSetup,
          date: now,
          monthRef,
        },
      ],
    });

    await addDoc(collection(db, "finance"), {
      data: now,
      valor: valorSetup,
      tipo: "entrada",
      categoria: "Receita Cliente",
      descricao: `Setup - Cliente ${convertLead.nome || ""}`,
      clientId: clientRef.id,
      createdAt: serverTimestamp(),
    });

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
          <select
            value={conversion.modalidade}
            onChange={(event) => setConversion({ ...conversion, modalidade: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            <option value="unico">Pagamento unico</option>
            <option value="recorrente">Pagamento recorrente</option>
          </select>

          {conversion.modalidade === "unico" ? (
            <input
              type="number"
              value={conversion.valorTotal}
              onChange={(event) => setConversion({ ...conversion, valorTotal: event.target.value })}
              className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
              placeholder="Valor total"
            />
          ) : (
            <>
              <input
                type="number"
                value={conversion.valorSetup}
                onChange={(event) => setConversion({ ...conversion, valorSetup: event.target.value })}
                className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                placeholder="Valor setup"
              />
              <input
                type="number"
                value={conversion.valorRecorrencia}
                onChange={(event) => setConversion({ ...conversion, valorRecorrencia: event.target.value })}
                className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                placeholder="Valor recorrencia"
              />
              <input
                type="date"
                value={conversion.recorrenciaData}
                onChange={(event) => setConversion({ ...conversion, recorrenciaData: event.target.value })}
                className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
                placeholder="Data da recorrencia"
              />
            </>
          )}
        </div>

        <div className="mt-4 text-xs text-slate/60">
          {conversion.modalidade === "unico" ? (
            <p>Esse valor entra imediatamente no financeiro como entrada unica.</p>
          ) : (
            <div className="space-y-1">
              <p>O setup entra imediatamente no financeiro.</p>
              <p>A recorrencia sera registrada somente ao confirmar o recebimento mensal.</p>
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
                Setup: {formatCurrency(parseNumberInput(conversion.valorSetup))}
              </p>
              <p className="font-medium">
                Mensalidade: {formatCurrency(parseNumberInput(conversion.valorRecorrencia))} (Venc.{" "}
                {recurrenceDate ? formatDayMonth(recurrenceDate) : "-"})
              </p>
            </div>
          )}
        </div>

        {convertInfo ? <p className="text-sm text-tide">{convertInfo}</p> : null}
      </Modal>
    </Layout>
  );
}
