import React, { useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Eye } from "lucide-react";

import Layout from "../components/Layout";
import Topbar from "../components/Topbar";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import useCollection from "../hooks/useCollection";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/format";
import { normalizeDate } from "../utils/filters";

export default function Approvals() {
  const { isAdmin, user } = useAuth();
  const { data: approvals } = useCollection("approvals", "createdAt", {
    enabled: isAdmin || Boolean(user),
    filters: isAdmin ? [] : [["requestedBy", "==", user?.uid || ""]],
  });
  const [selected, setSelected] = useState(null);

  const handleApprove = async (approval) => {
    const targetRef = doc(db, approval.collection, approval.docId);
    await updateDoc(targetRef, {
      ...approval.proposedData,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "approvals", approval.id), {
      status: "aprovado",
      resolvedAt: serverTimestamp(),
      resolvedBy: user?.uid || null,
    });
  };

  const handleReject = async (approval) => {
    await updateDoc(doc(db, "approvals", approval.id), {
      status: "rejeitado",
      resolvedAt: serverTimestamp(),
      resolvedBy: user?.uid || null,
    });
  };

  return (
    <Layout>
      <Topbar
        title="Aprovacoes"
        subtitle={isAdmin ? "Solicitacoes de edicao pendentes" : "Acompanhe suas solicitacoes"}
      />

      <DataTable
        columns={[
          { key: "collection", label: "Area" },
          { key: "requestedByName", label: "Solicitante" },
          {
            key: "createdAt",
            label: "Data",
            render: (row) => formatDate(normalizeDate(row.createdAt)),
          },
          { key: "status", label: "Status" },
          {
            key: "acoes",
            label: "Acoes",
            render: (row) => (
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(row)}
                  className="text-xs uppercase tracking-[0.2em] text-tide inline-flex items-center gap-1"
                >
                  <Eye size={14} />
                  Ver
                </button>
                {isAdmin && row.status === "pendente" ? (
                  <>
                    <button
                      onClick={() => handleApprove(row)}
                      className="text-xs uppercase tracking-[0.2em] text-green-600"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleReject(row)}
                      className="text-xs uppercase tracking-[0.2em] text-red-500"
                    >
                      Rejeitar
                    </button>
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={approvals}
        empty="Nenhuma solicitacao registrada."
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Detalhes da solicitacao"
      >
        <div className="space-y-4 text-sm text-slate/70">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Area</p>
            <p>{selected?.collection}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Solicitante</p>
            <p>{selected?.requestedByName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Proposta</p>
            <pre className="whitespace-pre-wrap text-xs bg-slate/5 rounded-2xl p-4">
              {JSON.stringify(selected?.proposedData, null, 2)}
            </pre>
          </div>
          {isAdmin ? (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate/50">Original</p>
              <pre className="whitespace-pre-wrap text-xs bg-slate/5 rounded-2xl p-4">
                {JSON.stringify(selected?.originalData, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </Modal>
    </Layout>
  );
}
