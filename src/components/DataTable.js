import React from "react";

export default function DataTable({ columns, rows, empty }) {
  return (
    <div className="glass-panel rounded-3xl p-6">
      <div className="overflow-x-auto scrollbar-soft">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.2em] text-slate/60">
            <tr className="border-b border-slate/10">
              {columns.map((col) => (
                <th key={col.key} className="pb-4 pr-4 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate/90">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-slate/60">
                  {empty || "Sem dados por enquanto."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate/10 hover:bg-slate/5">
                  {columns.map((col) => (
                    <td key={col.key} className="py-4 pr-4">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
