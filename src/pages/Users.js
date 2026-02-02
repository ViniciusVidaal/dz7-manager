import React, { useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Plus } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";

const initialForm = {
  nome: "",
  email: "",
  senha: "",
  role: "funcionario",
  cargo: "",
};

export default function Users() {
  const { isAdmin, createUser, user } = useAuth();
  const { data: users } = useCollection("users", "createdAt", { enabled: isAdmin });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [info, setInfo] = useState("");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    if (!search) return users;
    const term = search.toLowerCase();
    return users.filter((item) => String(item.nome || "").toLowerCase().includes(term));
  }, [users, search]);

  const openCreate = () => {
    setForm(initialForm);
    setEditing(null);
    setInfo("");
    setOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      nome: item.nome || "",
      email: item.email || "",
      senha: "",
      role: item.role || "funcionario",
      cargo: item.cargo || "",
    });
    setEditing(item);
    setInfo("");
    setOpen(true);
  };

  const handleSubmit = async () => {
    setInfo("");
    if (!form.nome || !form.email) {
      setInfo("Nome e email sao obrigatorios.");
      return;
    }

    if (!editing) {
      if (!form.senha || form.senha.length < 6) {
        setInfo("Defina uma senha com pelo menos 6 caracteres.");
        return;
      }
      try {
        await createUser({
          nome: form.nome,
          email: form.email,
          senha: form.senha,
          role: form.role,
          cargo: form.cargo,
        });
        setOpen(false);
      } catch (err) {
        if (err?.code === "auth/email-already-in-use") {
          setInfo("Este email ja esta em uso.");
          return;
        }
        setInfo("Nao foi possivel criar o usuario.");
        return;
      }
      return;
    }

    await updateDoc(doc(db, "users", editing.id), {
      nome: form.nome,
      role: form.role,
      cargo: form.cargo,
      updatedAt: serverTimestamp(),
    });
    setOpen(false);
  };

  const handleDelete = async (item) => {
    if (!item?.id) return;
    if (item.id === user?.uid) {
      setInfo("Voce nao pode excluir seu proprio usuario.");
      return;
    }
    const confirmed = window.confirm(`Excluir o usuario ${item.nome || item.email || ""}?`);
    if (!confirmed) return;
    await deleteDoc(doc(db, "users", item.id));
  };

  if (!isAdmin) {
    return (
      <Layout>
        <Topbar title="Usuarios" subtitle="Acesso restrito" />
        <div className="glass-panel rounded-3xl p-6">
          <p className="text-sm text-slate/60">Somente administradores podem gerenciar usuarios.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Topbar title="Usuarios" subtitle="Permissoes e cadastro de equipe" />

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex-1 max-w-xl">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Buscar por nome..."
          />
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-white"
        >
          <Plus size={16} />
          Novo usuario
        </button>
      </div>

      <DataTable
        columns={[
          { key: "nome", label: "Nome" },
          { key: "email", label: "Email" },
          { key: "role", label: "Role" },
          { key: "cargo", label: "Cargo" },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openEdit(row)}
                  className="text-xs uppercase tracking-[0.2em] text-tide"
                >
                  Editar
                </button>
                {row.id === user?.uid ? (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate/50">
                    Atual
                  </span>
                ) : (
                  <button
                    onClick={() => handleDelete(row)}
                    className="text-xs uppercase tracking-[0.2em] text-red-500"
                  >
                    Excluir
                  </button>
                )}
              </div>
            ),
          },
        ]}
        rows={rows}
        empty="Nenhum usuario cadastrado."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar usuario" : "Novo usuario"}
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
          <input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Email"
            disabled={Boolean(editing)}
          />
          {!editing ? (
            <input
              type="password"
              value={form.senha}
              onChange={(event) => setForm({ ...form, senha: event.target.value })}
              className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
              placeholder="Senha inicial"
            />
          ) : null}
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="funcionario">Funcionario</option>
          </select>
          <input
            value={form.cargo}
            onChange={(event) => setForm({ ...form, cargo: event.target.value })}
            className="rounded-2xl border border-slate/20 bg-white px-4 py-3 text-sm"
            placeholder="Cargo"
          />
        </div>
        {info ? <p className="text-sm text-tide">{info}</p> : null}
      </Modal>
    </Layout>
  );
}
