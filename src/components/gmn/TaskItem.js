import React from "react";

export default function TaskItem({ task, value, onToggle, onReasonChange }) {
  const taskState = value || { done: false, reason: "", touched: false };
  const showReason = !taskState.done && (taskState.touched || taskState.reason.trim().length > 0);

  return (
    <article className={`gmn-task-item ${taskState.done ? "is-done" : "is-pending"}`}>
      <label className="gmn-task-main">
        <input
          type="checkbox"
          checked={taskState.done}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="gmn-task-label">{task.title}</span>
        {task.required ? <span className="gmn-task-tag">Obrigatoria</span> : null}
      </label>

      {showReason ? (
        <div className="gmn-task-reason-wrap">
          <label className="gmn-task-reason-label" htmlFor={`${task.id}-reason`}>
            Justificativa/Motivo
          </label>
          <textarea
            id={`${task.id}-reason`}
            className="gmn-task-reason-input"
            placeholder="Descreva o motivo da tarefa nao realizada..."
            value={taskState.reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
          />
        </div>
      ) : null}
    </article>
  );
}
