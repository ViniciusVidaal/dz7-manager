import React, { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import ChecklistContainer from "../components/gmn/ChecklistContainer";
import TaskItem from "../components/gmn/TaskItem";
import ProgressBar from "../components/gmn/ProgressBar";
import AdminToggle from "../components/gmn/AdminToggle";
import { useAuth } from "../context/AuthContext";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import "./GMNChecklist.css";

const STORAGE_KEY = "dz7-gmn-checklist-v2";

const FIXED_TASKS = [
  { id: "generate-images", title: "Postagem No Google", required: true },
  { id: "gmn-post", title: "Postagem No Linkedin", required: true },
  { id: "blog-strategy", title: "Estrategia de Blog", required: true },
];

const EXTRA_TASKS = [
  { id: "backlinks", title: "Backlinks (Ativado pelo CEO)", shortLabel: "Backlinks" },
  { id: "directories", title: "Diretorios (Thiago)", shortLabel: "Diretorios" },
  { id: "full-diagnostic", title: "Diagnostico Completo", shortLabel: "Diagnostico" },
  { id: "semantic-chatgpt", title: "Semantica/ChatGPT", shortLabel: "Semantica" },
  {
    id: "profile-structure",
    title: "Verificacao/Estrutura de Perfil",
    shortLabel: "Verificacao",
  },
];

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

const DEFAULT_EXTRA_FLAGS = EXTRA_TASKS.reduce((acc, task) => {
  acc[task.id] = false;
  return acc;
}, {});

const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const formatDateLabel = (dateKey) => {
  if (!dateKey || typeof dateKey !== "string") return "-";
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return "-";
  return `${day}/${month}/${year}`;
};

const sanitizeProfileName = (value) => String(value || "").trim();

const buildProfileListFromClients = (clients) => {
  const names = clients
    .map((client) => sanitizeProfileName(client?.empresa || client?.nome))
    .filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "pt-BR"));
};

const normalizeAssignedProfiles = (raw) => {
  if (!Array.isArray(raw)) return [];
  const names = raw.map((item) => sanitizeProfileName(item)).filter(Boolean);
  return Array.from(new Set(names));
};

const createTaskState = (raw) => ({
  done: Boolean(raw?.done),
  reason: typeof raw?.reason === "string" ? raw.reason : "",
  touched: Boolean(raw?.touched),
});

const getVisibleTasks = (profileRecord) => [
  ...FIXED_TASKS,
  ...EXTRA_TASKS.filter((task) => profileRecord?.delegatedActive?.[task.id]),
];

const normalizeProfileRecord = (raw) => {
  const delegatedActive = {
    ...DEFAULT_EXTRA_FLAGS,
    ...(raw?.delegatedActive && typeof raw.delegatedActive === "object" ? raw.delegatedActive : {}),
  };

  const tasks = {};
  const visibleTaskIds = getVisibleTasks({ delegatedActive }).map((task) => task.id);
  const knownTaskIds = [...FIXED_TASKS.map((task) => task.id), ...EXTRA_TASKS.map((task) => task.id)];

  knownTaskIds.forEach((taskId) => {
    if (visibleTaskIds.includes(taskId) || raw?.tasks?.[taskId]) {
      tasks[taskId] = createTaskState(raw?.tasks?.[taskId]);
    }
  });

  return { delegatedActive, tasks };
};

const normalizeDayRecord = (rawDay, profileNames) =>
  profileNames.reduce((acc, profileName) => {
    acc[profileName] = normalizeProfileRecord(rawDay?.[profileName]);
    return acc;
  }, {});

const getDayStatus = (records, dateKey, profileName) => {
  if (!profileName) return "empty";
  const day = records?.[dateKey];
  if (!day) return "empty";

  const profileRecord = normalizeProfileRecord(day[profileName]);
  const tasks = getVisibleTasks(profileRecord);
  if (!tasks.length) return "empty";

  const doneCount = tasks.filter((task) => profileRecord.tasks?.[task.id]?.done).length;
  return doneCount === tasks.length ? "complete" : "incomplete";
};

const buildInitialState = (todayKey) => {
  const baseState = {
    selectedProfile: "",
    adminCalendarProfile: "",
    adminActivationProfile: "",
    records: { [todayKey]: {} },
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return baseState;

    return {
      selectedProfile: sanitizeProfileName(parsed.selectedProfile),
      adminCalendarProfile: sanitizeProfileName(parsed.adminCalendarProfile),
      adminActivationProfile: sanitizeProfileName(parsed.adminActivationProfile),
      records: parsed.records && typeof parsed.records === "object" ? parsed.records : baseState.records,
    };
  } catch {
    return baseState;
  }
};

export default function GMNChecklist() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: users } = useCollection("users", "nome", {
    enabled: isAdmin,
    orderDirection: "asc",
  });
  const { data: clients } = useCollection("clients", "createdAt");

  const allProfiles = useMemo(() => buildProfileListFromClients(clients), [clients]);
  const assignedProfiles = useMemo(
    () => normalizeAssignedProfiles(profile?.assignedProfiles),
    [profile?.assignedProfiles]
  );
  const availableProfiles = useMemo(
    () => (isAdmin ? allProfiles : assignedProfiles),
    [isAdmin, allProfiles, assignedProfiles]
  );

  const today = useMemo(() => new Date(), []);
  const todayDateOnly = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    [today]
  );
  const todayKey = useMemo(() => toDateKey(today), [today]);

  const [state, setState] = useState(() => buildInitialState(todayKey));
  const [savingAssignments, setSavingAssignments] = useState({});
  const [assignmentInfo, setAssignmentInfo] = useState("");

  useEffect(() => {
    setState((prev) => {
      if (prev.records?.[todayKey]) return prev;
      return {
        ...prev,
        records: { ...prev.records, [todayKey]: {} },
      };
    });
  }, [todayKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    setState((prev) => {
      if (!availableProfiles.length) {
        if (!prev.selectedProfile) return prev;
        return { ...prev, selectedProfile: "" };
      }
      if (availableProfiles.includes(prev.selectedProfile)) return prev;
      return { ...prev, selectedProfile: availableProfiles[0] };
    });
  }, [availableProfiles]);

  useEffect(() => {
    setState((prev) => {
      if (!allProfiles.length) {
        if (!prev.adminActivationProfile && !prev.adminCalendarProfile) return prev;
        return { ...prev, adminActivationProfile: "", adminCalendarProfile: "" };
      }

      const nextActivation = allProfiles.includes(prev.adminActivationProfile)
        ? prev.adminActivationProfile
        : allProfiles[0];
      const nextCalendar = allProfiles.includes(prev.adminCalendarProfile)
        ? prev.adminCalendarProfile
        : allProfiles[0];

      if (
        nextActivation === prev.adminActivationProfile
        && nextCalendar === prev.adminCalendarProfile
      ) {
        return prev;
      }

      return {
        ...prev,
        adminActivationProfile: nextActivation,
        adminCalendarProfile: nextCalendar,
      };
    });
  }, [allProfiles]);

  const dayProfiles = isAdmin ? allProfiles : availableProfiles;
  const todayRecord = useMemo(
    () => normalizeDayRecord(state.records?.[todayKey], dayProfiles),
    [state.records, todayKey, dayProfiles]
  );

  const selectedProfileRecord = useMemo(() => {
    if (!state.selectedProfile) return normalizeProfileRecord(null);
    return normalizeProfileRecord(todayRecord[state.selectedProfile]);
  }, [todayRecord, state.selectedProfile]);

  const selectedProfileTasks = useMemo(
    () => getVisibleTasks(selectedProfileRecord),
    [selectedProfileRecord]
  );

  const selectedProfileDoneCount = useMemo(
    () =>
      selectedProfileTasks.filter((task) => selectedProfileRecord.tasks?.[task.id]?.done).length,
    [selectedProfileTasks, selectedProfileRecord.tasks]
  );

  const selectedProfileProgress = useMemo(() => {
    if (!selectedProfileTasks.length) return 0;
    return Math.round((selectedProfileDoneCount / selectedProfileTasks.length) * 100);
  }, [selectedProfileDoneCount, selectedProfileTasks.length]);

  const updateTodayProfile = (profileName, updater) => {
    if (!profileName) return;
    setState((prev) => {
      const currentDay = normalizeDayRecord(prev.records?.[todayKey], dayProfiles);
      const currentProfile = normalizeProfileRecord(currentDay[profileName]);
      const nextProfile = normalizeProfileRecord(updater(currentProfile));

      return {
        ...prev,
        records: {
          ...prev.records,
          [todayKey]: {
            ...currentDay,
            [profileName]: nextProfile,
          },
        },
      };
    });
  };

  const handleTaskToggle = (taskId, checked) => {
    updateTodayProfile(state.selectedProfile, (profileRecord) => {
      const previousTask = profileRecord.tasks?.[taskId] || createTaskState(null);
      return {
        ...profileRecord,
        tasks: {
          ...profileRecord.tasks,
          [taskId]: {
            ...previousTask,
            done: checked,
            touched: true,
            reason: checked ? "" : previousTask.reason,
          },
        },
      };
    });
  };

  const handleReasonChange = (taskId, reason) => {
    updateTodayProfile(state.selectedProfile, (profileRecord) => {
      const previousTask = profileRecord.tasks?.[taskId] || createTaskState(null);
      return {
        ...profileRecord,
        tasks: {
          ...profileRecord.tasks,
          [taskId]: {
            ...previousTask,
            done: false,
            touched: true,
            reason,
          },
        },
      };
    });
  };

  const handleExtraToggle = (profileName, taskId, nextValue) => {
    updateTodayProfile(profileName, (profileRecord) => {
      const existingTask = profileRecord.tasks?.[taskId] || createTaskState(null);
      return {
        delegatedActive: {
          ...profileRecord.delegatedActive,
          [taskId]: nextValue,
        },
        tasks: {
          ...profileRecord.tasks,
          [taskId]: existingTask,
        },
      };
    });
  };

  const teamMembers = useMemo(
    () => users.filter((item) => item.role !== "admin"),
    [users]
  );

  const handleAssignProfile = async (userItem, profileName, shouldAssign) => {
    if (!userItem?.id) return;
    setAssignmentInfo("");
    setSavingAssignments((prev) => ({ ...prev, [userItem.id]: true }));
    try {
      const current = normalizeAssignedProfiles(userItem.assignedProfiles);
      const next = shouldAssign
        ? Array.from(new Set([...current, profileName]))
        : current.filter((item) => item !== profileName);
      await updateDoc(doc(db, "users", userItem.id), {
        assignedProfiles: next,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setAssignmentInfo("Nao foi possivel atualizar a atribuicao de perfis.");
    } finally {
      setSavingAssignments((prev) => ({ ...prev, [userItem.id]: false }));
    }
  };

  const activationProfileRecord = useMemo(() => {
    if (!state.adminActivationProfile) return normalizeProfileRecord(null);
    return normalizeProfileRecord(todayRecord[state.adminActivationProfile]);
  }, [todayRecord, state.adminActivationProfile]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const mondayIndex = (firstDay.getDay() + 6) % 7;
    const cells = [];

    for (let i = 0; i < mondayIndex; i += 1) {
      cells.push({ key: `empty-${i}`, empty: true });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), day);
      const dateKey = toDateKey(date);
      const isFuture = date > todayDateOnly;

      cells.push({
        key: dateKey,
        day,
        empty: false,
        status: isFuture ? "future" : getDayStatus(state.records, dateKey, state.adminCalendarProfile),
      });
    }

    return cells;
  }, [today, todayDateOnly, state.records, state.adminCalendarProfile]);

  const justificationLog = useMemo(() => {
    const rows = [];
    const logProfiles = isAdmin ? allProfiles : availableProfiles;

    Object.entries(state.records || {}).forEach(([dateKey, dayRecord]) => {
      logProfiles.forEach((profileName) => {
        const profileRecord = normalizeProfileRecord(dayRecord?.[profileName]);
        const tasks = getVisibleTasks(profileRecord);

        tasks.forEach((task) => {
          const taskState = profileRecord.tasks?.[task.id];
          const reason = String(taskState?.reason || "").trim();
          if (!taskState?.done && reason) {
            rows.push({
              key: `${dateKey}-${profileName}-${task.id}`,
              dateKey,
              profileName,
              taskName: task.title,
              reason,
            });
          }
        });
      });
    });

    return rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [state.records, isAdmin, allProfiles, availableProfiles]);

  return (
    <Layout>
      <Topbar
        title="Checklist Inteligente GMN"
        subtitle="Execucao diaria por empresa com controle de consistencia e delegacao"
      />

      <ChecklistContainer>
        <header className="gmn-hero">
          <h3>dz7 Marketing | Operacao Google Meu Negocio</h3>
          <p>Data de referencia: {formatDateLabel(todayKey)}</p>
        </header>

        <section className="gmn-panel">
          <div className="gmn-section-header">
            <h4>Visao do Colaborador</h4>
            <span>Selecione a empresa para abrir o checklist do dia</span>
          </div>

          <div className="gmn-profile-picker">
            <label htmlFor="profile-select">Empresa</label>
            <select
              id="profile-select"
              value={state.selectedProfile}
              onChange={(event) =>
                setState((prev) => ({
                  ...prev,
                  selectedProfile: event.target.value,
                }))
              }
              disabled={!availableProfiles.length}
            >
              {availableProfiles.length ? null : <option value="">Sem empresas atribuidas</option>}
              {availableProfiles.map((profileName) => (
                <option key={profileName} value={profileName}>
                  {profileName}
                </option>
              ))}
            </select>
          </div>

          {!availableProfiles.length ? (
            <p className="gmn-empty">
              Nenhuma empresa foi atribuida para este funcionario. O CEO precisa vincular no painel
              de atribuicao.
            </p>
          ) : (
            <div className="gmn-execution">
              <div className="gmn-execution-head">
                <h5>{state.selectedProfile}</h5>
                <span>
                  {selectedProfileDoneCount}/{selectedProfileTasks.length} tarefas concluidas hoje
                </span>
              </div>

              <ProgressBar value={selectedProfileProgress} label="Barra de progresso em tempo real" />

              <div className="gmn-task-list">
                {selectedProfileTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    value={selectedProfileRecord.tasks?.[task.id]}
                    onToggle={(checked) => handleTaskToggle(task.id, checked)}
                    onReasonChange={(reason) => handleReasonChange(task.id, reason)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {isAdmin ? (
          <>
            <section className="gmn-panel">
              <div className="gmn-section-header">
                <h4>Visao do Gestor (Vinicius - CEO)</h4>
                <span>Selecione a empresa e ative tarefas extras do dia</span>
              </div>

              <div className="gmn-profile-picker">
                <label htmlFor="activation-company-select">Empresa para ativacao</label>
                <select
                  id="activation-company-select"
                  value={state.adminActivationProfile}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      adminActivationProfile: event.target.value,
                    }))
                  }
                  disabled={!allProfiles.length}
                >
                  {allProfiles.length ? null : <option value="">Sem empresas cadastradas</option>}
                  {allProfiles.map((profileName) => (
                    <option key={`activation-${profileName}`} value={profileName}>
                      {profileName}
                    </option>
                  ))}
                </select>
              </div>

              {state.adminActivationProfile ? (
                <article className="gmn-admin-card">
                  <h5>{state.adminActivationProfile}</h5>
                  <p>Ativar tarefa extra</p>
                  <div className="gmn-admin-toggles">
                    {EXTRA_TASKS.map((task) => (
                      <AdminToggle
                        key={`${state.adminActivationProfile}-${task.id}`}
                        label={`Ativar ${task.shortLabel}`}
                        checked={Boolean(activationProfileRecord.delegatedActive?.[task.id])}
                        onChange={(value) =>
                          handleExtraToggle(state.adminActivationProfile, task.id, value)
                        }
                      />
                    ))}
                  </div>
                </article>
              ) : (
                <p className="gmn-empty">
                  Nenhuma empresa encontrada na aba Clientes. Cadastre um cliente para liberar.
                </p>
              )}
            </section>

            <section className="gmn-panel">
              <div className="gmn-section-header">
                <h4>Atribuicao de Empresas por Funcionario</h4>
                <span>
                  Toda empresa cadastrada em Clientes entra automaticamente aqui para vinculo
                </span>
              </div>

              {!allProfiles.length ? (
                <p className="gmn-empty">
                  Nenhuma empresa cadastrada em Clientes. Cadastre empresas para atribuir.
                </p>
              ) : teamMembers.length ? (
                <div className="gmn-assignment-grid">
                  {teamMembers.map((member) => {
                    const memberAssigned = normalizeAssignedProfiles(member.assignedProfiles);
                    const isSaving = Boolean(savingAssignments[member.id]);
                    return (
                      <article key={member.id} className="gmn-assignment-card">
                        <div className="gmn-assignment-head">
                          <h5>{member.nome || member.email || "Funcionario"}</h5>
                          <span>{member.cargo || "Equipe"}</span>
                        </div>

                        <div className="gmn-assignment-list">
                          {allProfiles.map((profileName) => (
                            <label key={`${member.id}-${profileName}`} className="gmn-assignment-item">
                              <input
                                type="checkbox"
                                checked={memberAssigned.includes(profileName)}
                                disabled={isSaving}
                                onChange={(event) =>
                                  handleAssignProfile(member, profileName, event.target.checked)
                                }
                              />
                              <span>{profileName}</span>
                            </label>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="gmn-empty">Nenhum funcionario encontrado para atribuicao.</p>
              )}

              {assignmentInfo ? <p className="gmn-empty">{assignmentInfo}</p> : null}
            </section>

            <section className="gmn-panel">
              <div className="gmn-section-header">
                <h4>Heatmap de Consistencia (Mes Atual)</h4>
                <span>Verde = 100% feito | Vermelho = houve pendencias</span>
              </div>

              <div className="gmn-profile-picker">
                <label htmlFor="calendar-company-select">Empresa no heatmap</label>
                <select
                  id="calendar-company-select"
                  value={state.adminCalendarProfile}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      adminCalendarProfile: event.target.value,
                    }))
                  }
                  disabled={!allProfiles.length}
                >
                  {allProfiles.length ? null : <option value="">Sem empresas cadastradas</option>}
                  {allProfiles.map((profileName) => (
                    <option key={`calendar-${profileName}`} value={profileName}>
                      {profileName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="gmn-calendar-grid">
                {WEEKDAY_LABELS.map((day) => (
                  <div key={day} className="gmn-calendar-weekday">
                    {day}
                  </div>
                ))}

                {calendarCells.map((cell) =>
                  cell.empty ? (
                    <div key={cell.key} className="gmn-calendar-cell is-empty" />
                  ) : (
                    <div key={cell.key} className={`gmn-calendar-cell is-${cell.status}`}>
                      {cell.day}
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="gmn-panel">
              <div className="gmn-section-header">
                <h4>Log de Justificativas</h4>
                <span>Motivos registrados para tarefas nao realizadas</span>
              </div>

              {justificationLog.length ? (
                <div className="gmn-log-list">
                  {justificationLog.map((item) => (
                    <article key={item.key} className="gmn-log-item">
                      <div className="gmn-log-meta">
                        <strong>{item.profileName}</strong>
                        <span>{item.taskName}</span>
                        <span>{formatDateLabel(item.dateKey)}</span>
                      </div>
                      <p>{item.reason}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="gmn-empty">Nenhuma justificativa registrada ate o momento.</p>
              )}
            </section>
          </>
        ) : null}
      </ChecklistContainer>
    </Layout>
  );
}
