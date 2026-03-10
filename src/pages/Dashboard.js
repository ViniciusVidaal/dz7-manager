import React, { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Bell, Filter, X } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import StatCard from "../components/StatCard";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDate, getMonthRef, parseDateInput } from "../utils/format";
import {
  filterByRange,
  getPresetRange,
  groupExpensesByCategory,
  normalizeDate,
} from "../utils/filters";
import { getDueDateForMonthRef, getNextRecurringDate } from "../utils/recurrence";

const PIE_COLORS = ["#19b6e0", "#74d8f2", "#0f4c5c", "#1f2937"];
const WEEKDAY_LABELS = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"];

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

export default function Dashboard() {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: finance } = useCollection("finance", "data", { enabled: isAdmin });
  const { data: leads } = useCollection("leads", "createdAt");
  const { data: investments } = useCollection("investments", "createdAt");
  const { data: approvals } = useCollection("approvals", "createdAt", {
    enabled: isAdmin || Boolean(user),
    filters: isAdmin ? [] : [["requestedBy", "==", user?.uid || ""]],
  });
  const { data: notifications } = useCollection("notifications", "createdAt", {
    enabled: Boolean(user),
  });
  const { data: clients } = useCollection("clients", "createdAt", { enabled: isAdmin });
  const { data: tools } = useCollection("tools", "vencimento", { enabled: isAdmin });

  const [rangeType, setRangeType] = useState("mes");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [toolAlertOpen, setToolAlertOpen] = useState(false);
  const [toolAlertDismissed, setToolAlertDismissed] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState([]);

  const range = useMemo(() => {
    if (rangeType === "intervalo") {
      return { start: parseDateInput(customStart), end: parseDateInput(customEnd) };
    }
    return getPresetRange(rangeType);
  }, [rangeType, customStart, customEnd]);

  const filteredFinance = useMemo(() => filterByRange(finance, "data", range), [finance, range]);

  const entradasTotal = finance.filter((item) => item.tipo === "entrada");
  const saidasTotal = finance.filter((item) => item.tipo === "saida");
  const saldo = entradasTotal.reduce((acc, item) => acc + Number(item.valor || 0), 0)
    - saidasTotal.reduce((acc, item) => acc + Number(item.valor || 0), 0);

  const entradas = filteredFinance.filter((item) => item.tipo === "entrada");
  const saidas = filteredFinance.filter((item) => item.tipo === "saida");

  const today = new Date();
  const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const dismissedStorageKey = `dismissedNotifications:${dayKey}`;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const cutoffPast = new Date(startOfToday);
  cutoffPast.setDate(cutoffPast.getDate() - 1);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const faturamento = entradas.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const gastos = saidas.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const ferramentasMensais = isAdmin
    ? tools.reduce((acc, tool) => {
        if (tool.status === "concluido") return acc;
        const due = normalizeDate(tool.vencimento);
        if (!due) return acc;
        if (due > endOfMonth) return acc;
        if (due < cutoffPast) return acc;
        return acc + Number(tool.valor || 0);
      }, 0)
    : 0;
  const lucro = saldo - ferramentasMensais;

  const receitaPorSemana = useMemo(() => {
    const totals = WEEKDAY_LABELS.map(() => 0);
    entradas.forEach((item) => {
      const date = normalizeDate(item.data);
      if (!date) return;
      const weekday = date.getDay();
      const weekdayIndex = weekday === 0 ? 6 : weekday - 1;
      totals[weekdayIndex] += Number(item.valor || 0);
    });
    return WEEKDAY_LABELS.map((label, index) => ({
      weekday: label,
      value: totals[index],
    }));
  }, [entradas]);

  const despesasPorCategoria = groupExpensesByCategory(
    saidas.map((item) => ({ categoria: item.categoria, valor: Number(item.valor || 0) }))
  );

  const currentMonthRef = getMonthRef(today);

  const toolDueItems = isAdmin
    ? tools.filter((tool) => {
        if (tool.status === "concluido") return false;
        const due = normalizeDate(tool.vencimento);
        if (!due) return false;
        return due >= startOfToday && due <= endOfToday;
      })
    : [];

  const clientDueItems = isAdmin
    ? clients.filter((client) => {
        if (client.tipo_contrato !== "recorrente") return false;
        const dueDate = getDueDateForMonthRef(client, currentMonthRef);
        if (!dueDate) return false;
        if (client.lastPaymentMonth === currentMonthRef) return false;
        return dueDate >= startOfToday && dueDate <= endOfToday;
      })
    : [];

  const pendingApprovals = approvals.filter((item) => item.status === "pendente");
  const pendingInvestmentApprovals = isAdmin
    ? pendingApprovals.filter((item) => item.collection === "investments")
    : [];
  const newNotifications = notifications.filter((item) => item.status === "new");
  const contractAlerts = notifications.filter((item) => {
    if (item.type !== "contract_end") return false;
    const due = normalizeDate(item.dueDate);
    if (!due) return false;
    return isSameDay(due, today) && item.status !== "concluido";
  });

  const allDueNotifications = [
    ...contractAlerts.map((item) => ({
      id: `contract-${item.id}`,
      title: `Contrato vence amanha: ${item.clientName || "Cliente"}`,
      subtitle: `Vencimento em ${formatDate(normalizeDate(item.endDate))}`,
      type: "contract",
      source: "notifications",
      sourceId: item.id,
    })),
    ...(isAdmin
      ? [
          ...toolDueItems.map((tool) => ({
            id: `tool-${tool.id}`,
            title: `Ferramenta: ${tool.nome || "Sem nome"}`,
            subtitle: `Venceu em ${formatDate(normalizeDate(tool.vencimento))}`,
            type: "tool",
            source: "tools",
            sourceId: tool.id,
          })),
          ...clientDueItems.map((client) => ({
            id: `client-${client.id}`,
            title: `Mensalidade: ${client.nome || "Cliente"}`,
            subtitle: `Venceu em ${formatDate(
              getDueDateForMonthRef(client, currentMonthRef) || getNextRecurringDate(client, today)
            )}`,
            type: "client",
            source: "clients",
            sourceId: client.id,
          })),
          ...pendingInvestmentApprovals.map((approval) => ({
            id: `approval-${approval.id}`,
            title: `Investimento: ${
              approval.proposedData?.nome || approval.originalData?.nome || "Solicitacao"
            }`,
            subtitle: `Solicitado por ${approval.requestedByName || "Equipe"}`,
            type: "approval",
            source: "approvals",
            sourceId: approval.id,
          })),
        ]
      : []),
  ].filter((item) => !dismissedNotifications.includes(item.id));

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(dismissedStorageKey) || "[]");
      if (Array.isArray(stored)) {
        setDismissedNotifications(stored);
      } else {
        setDismissedNotifications([]);
      }
    } catch {
      setDismissedNotifications([]);
    }
  }, [dismissedStorageKey]);

  const handleDismissNotification = async (item) => {
    setDismissedNotifications((prev) => {
      if (prev.includes(item.id)) return prev;
      const next = [...prev, item.id];
      try {
        localStorage.setItem(dismissedStorageKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });

    if (item.source === "notifications" && item.sourceId) {
      try {
        await updateDoc(doc(db, "notifications", item.sourceId), {
          status: "concluido",
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        // Silencioso: evita travar a UI caso falhe a permissao.
      }
    }
  };

  useEffect(() => {
    if (toolAlertDismissed) return;
    if (toolDueItems.length > 0) {
      setToolAlertOpen(true);
    }
  }, [toolDueItems.length, toolAlertDismissed]);

  const recurringClients = isAdmin
    ? clients.filter((client) => client.tipo_contrato === "recorrente")
    : [];

  const receivableSoon = isAdmin
    ? recurringClients.reduce((acc, client) => {
        const dueDate = getNextRecurringDate(client, today);
        if (!dueDate) return acc;
        const dueMonthRef = getMonthRef(dueDate);
        if (dueMonthRef !== currentMonthRef) return acc;
        if (client.lastPaymentMonth === dueMonthRef) return acc;
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0 || diffDays > 30) return acc;
        return acc + Number(client.recorrenciaValor || 0);
      }, 0)
    : 0;

  const quickStats = isAdmin
    ? [
        { title: "Saldo em caixa", value: formatCurrency(saldo), hint: "Atualizado" },
        { title: "Faturamento", value: formatCurrency(faturamento), hint: "Receitas" },
        { title: "Gastos", value: formatCurrency(gastos), hint: "Despesas", accent: "glow" },
        { title: "Lucro", value: formatCurrency(lucro), hint: "Caixa - ferramentas do mes" },
        { title: "Recebiveis 30 dias", value: formatCurrency(receivableSoon), hint: "Recorrencias" },
      ]
    : [
        { title: "Leads cadastrados", value: leads.length, hint: "Total" },
        { title: "Investimentos", value: investments.length, hint: "Projetos" },
        { title: "Solicitacoes pendentes", value: pendingApprovals.length, hint: "Aguardando" },
      ];

  const approvalNotificationRows = pendingInvestmentApprovals.map((item) => ({
    id: `approval-${item.id}`,
    tipo: "Investimento",
    email: item.requestedByName || "-",
    data: formatDate(normalizeDate(item.createdAt)),
  }));

  const notificationRows = [
    ...approvalNotificationRows,
    ...newNotifications.map((item) => ({
      id: item.id,
      tipo: item.type === "password_reset" ? "Senha" : item.type,
      email: item.email,
      data: formatDate(normalizeDate(item.createdAt)),
    })),
  ];

  return (
    <Layout>
      <Topbar title="Dashboard" subtitle="Visao geral do fluxo comercial e financeiro" />

      <div className="flex justify-end mb-4">
        <div className="relative">
          <button
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate hover:bg-white"
          >
            <Bell size={14} />
            Notificacoes
            {allDueNotifications.length > 0 ? (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] px-2 py-0.5">
                {allDueNotifications.length}
              </span>
            ) : null}
          </button>
          {showNotifications ? (
            <div className="absolute right-0 mt-3 w-80 glass-panel rounded-2xl p-4 z-20">
              <p className="text-xs uppercase tracking-[0.2em] text-slate/60 mb-3">
                Notificacoes do dia
              </p>
              {allDueNotifications.length === 0 ? (
                <p className="text-sm text-slate/60">Nenhuma notificacao pendente.</p>
              ) : (
                <div className="space-y-3">
                  {allDueNotifications.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate/10 bg-white/70 px-3 py-2"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-slate">{item.title}</span>
                        <span className="text-xs text-slate/60">{item.subtitle}</span>
                      </div>
                      <button
                        onClick={() => handleDismissNotification(item)}
                        className="rounded-full p-1 text-slate/50 hover:text-slate"
                        aria-label="Fechar notificacao"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
        {quickStats.map((stat, index) => (
          <StatCard key={stat.title} {...stat} accent={stat.accent || (index % 2 ? "glow" : "tide")} />
        ))}
      </div>

      <div className="glass-panel rounded-3xl p-6 mb-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-tide" />
            <p className="text-sm text-slate/70">Filtro de periodo</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={rangeType}
              onChange={(event) => setRangeType(event.target.value)}
              className="rounded-full border border-slate/20 bg-white px-4 py-2 text-sm"
            >
              <option value="dia">Hoje</option>
              <option value="mes">Este mes</option>
              <option value="ano">Este ano</option>
              <option value="intervalo">Intervalo</option>
            </select>
            {rangeType === "intervalo" ? (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-full border border-slate/20 bg-white px-4 py-2 text-sm"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-full border border-slate/20 bg-white px-4 py-2 text-sm"
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-10">
          <div className="glass-panel rounded-3xl p-6 xl:col-span-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-[0.2em] text-slate/60">Evolucao de faturamento</h3>
              <span className="text-xs text-slate/50">Receitas confirmadas por dia da semana</span>
            </div>
            <div className="mt-6 min-h-[260px] min-w-[280px]">
              <ResponsiveContainer width="100%" height={260} minHeight={260} minWidth={280}>
                <BarChart data={receitaPorSemana} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                  <XAxis dataKey="weekday" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(label) => `Dia: ${label}`}
                  />
                  <Bar
                    dataKey="value"
                    stroke="#19b6e0"
                    fill="#19b6e0"
                    radius={[8, 8, 0, 0]}
                    barSize={12}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-6 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-[0.2em] text-slate/60">Divisao de gastos</h3>
              <span className="text-xs text-slate/50">Categorias</span>
            </div>
            <div className="mt-6 min-h-[260px] min-w-[280px]">
              <ResponsiveContainer width="100%" height={260} minHeight={260} minWidth={280}>
                <PieChart>
                  <Pie
                    data={despesasPorCategoria}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {despesasPorCategoria.map((entry, index) => (
                      <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {despesasPorCategoria.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs text-slate/70">
                  <span>{item.name}</span>
                  <span>{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl p-6 mb-8">
          <p className="text-sm text-slate/60">
            Graficos financeiros disponiveis apenas para administradores.
          </p>
        </div>
      )}

      {!isAdmin ? (
        <div className="glass-panel rounded-3xl p-6 mb-10">
          <h3 className="text-sm uppercase tracking-[0.2em] text-slate/60 mb-4">
            Solicitacoes enviadas
          </h3>
          <DataTable
            columns={[
              { key: "collection", label: "Area" },
              { key: "status", label: "Status" },
              {
                key: "createdAt",
                label: "Data",
                render: (row) => formatDate(normalizeDate(row.createdAt)),
              },
            ]}
            rows={approvals}
            empty="Nenhuma solicitacao enviada."
          />
        </div>
      ) : null}

      {isAdmin ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} className="text-tide" />
              <h3 className="text-sm uppercase tracking-[0.2em] text-slate/60">Notificacoes</h3>
            </div>
            <DataTable
              columns={[
                { key: "tipo", label: "Tipo" },
                { key: "email", label: "Email" },
                { key: "data", label: "Data" },
              ]}
              rows={notificationRows}
              empty="Sem notificacoes novas."
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} className="text-glow" />
              <h3 className="text-sm uppercase tracking-[0.2em] text-slate/60">Aprovacoes pendentes</h3>
            </div>
            <DataTable
              columns={[
                { key: "collection", label: "Area" },
                { key: "requestedByName", label: "Solicitante" },
                { key: "createdAt", label: "Data" },
              ]}
              rows={pendingApprovals.map((item) => ({
                ...item,
                createdAt: formatDate(normalizeDate(item.createdAt)),
              }))}
              empty="Nenhuma solicitacao aguardando."
            />
          </div>
        </div>
      ) : null}

      <Modal
        open={toolAlertOpen}
        onClose={() => {
          setToolAlertOpen(false);
          setToolAlertDismissed(true);
        }}
        title="Alertas de pagamento"
        actions={
          <button
            onClick={() => {
              setToolAlertOpen(false);
              setToolAlertDismissed(true);
            }}
            className="rounded-full bg-ink px-5 py-2 text-xs uppercase tracking-[0.2em] text-white"
          >
            Entendi
          </button>
        }
      >
        <div className="space-y-4 text-sm text-slate/70">
          {toolDueItems.length === 0 ? (
            <p>Nenhuma ferramenta vencida hoje.</p>
          ) : (
            <div className="space-y-2">
              {toolDueItems.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between rounded-2xl border border-slate/10 bg-white/70 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-slate">{tool.nome}</p>
                    <p className="text-xs text-slate/60">
                      Vencimento: {formatDate(normalizeDate(tool.vencimento))}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-slate">
                    {formatCurrency(tool.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
