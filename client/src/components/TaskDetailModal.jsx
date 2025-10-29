// src/components/TaskDetailModal.jsx
import React, { useState } from "react";
import { formatDisplayDate, formatPlanRange } from "../utils/date";

/**
 * TaskDetailModal
 *
 * Props:
 * - task: the full task object
 *   {
 *     Task_id,
 *     Task_name,
 *     Task_description,
 *     Task_plan, // "" or Plan_MVP_name
 *     Task_app_acronym,
 *     Task_state,
 *     Task_creator,
 *     Task_owner,
 *     Task_createDate (yyyy-MM-dd),
 *     Task_notes: [ {author, status, datetime, note?, message?}, ... ]
 *   }
 *
 * - plans: array of all plans [{Plan_MVP_name, Plan_startDate, Plan_endDate, Plan_app_acronym}, ...]
 * - onClose(): close modal
 *
 * - onChangePlan(newPlanNameOrEmpty): PATCH task_plan
 * - onReleaseTask(): PATCH to move from Open -> ToDo
 * - onAddNote(noteText): PATCH append note
 *
 * - canModifyCurrentState: boolean (can add note / change plan)
 * - canRelease: boolean (can press Release Task)
 */
export default function TaskDetailModal({
  task,
  plans,
  onClose,
  onChangePlan,
  onReleaseTask,
  onAddNote,
  canModifyCurrentState,
  canRelease,
}) {
  const [noteDraft, setNoteDraft] = useState("");

  // Helper to find the current plan info
  const currentPlan = task.Task_plan
    ? plans.find((p) => p.Plan_MVP_name === task.Task_plan)
    : null;

  const createdOnDisplay = task.Task_createDate
    ? formatDisplayDate(task.Task_createDate)
    : "";

  // Plan dropdown options:
  //  - ""   => No plan
  //  - rest => from plans array, show "PlanName (date range)"
  function handlePlanSelect(e) {
    onChangePlan(e.target.value); // "" or Plan_MVP_name
  }

  function handleAddNote() {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setNoteDraft("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-auto py-10 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-lg font-semibold text-gray-800">
              {task.Task_id} : {task.Task_name}
            </div>

            <div className="inline-block text-[11px] mt-2 px-2 py-[2px] rounded-md bg-gray-100 text-gray-700 border border-gray-300 uppercase tracking-wide font-medium">
              {task.Task_state || ""}
            </div>
          </div>

          <button
            className="text-sm font-semibold text-gray-700 bg-gray-200 rounded px-2 py-1 hover:bg-gray-300"
            onClick={onClose}
          >
            X
          </button>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left column */}
          <div className="space-y-4">
            {/* Task Description (read-only) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Task Description:
              </label>
              <textarea
                className="w-full border rounded px-2 py-2 text-sm bg-gray-50 text-gray-700"
                rows={3}
                readOnly
                value={task.Task_description || ""}
              />
            </div>

            {/* Meta info */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-700">
              <div>
                <div className="font-medium text-gray-500">Owner:</div>
                <div className="text-gray-800">
                  {task.Task_owner || "—"}
                </div>
              </div>

              <div>
                <div className="font-medium text-gray-500">Creator:</div>
                <div className="text-gray-800">
                  {task.Task_creator || "—"}
                </div>
              </div>

              <div>
                <div className="font-medium text-gray-500">Created On:</div>
                <div className="text-gray-800">{createdOnDisplay || "—"}</div>
              </div>
            </div>

            {/* Plan selector */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Plan:
              </label>

              <select
                className="w-full border rounded px-2 py-2 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                value={task.Task_plan || ""}
                onChange={handlePlanSelect}
                disabled={!canModifyCurrentState}
              >
                <option value="">— No plan —</option>
                {plans.map((p) => {
                  const range = formatPlanRange(
                    p.Plan_startDate,
                    p.Plan_endDate
                  );
                  return (
                    <option key={p.Plan_MVP_name} value={p.Plan_MVP_name}>
                      {p.Plan_MVP_name}
                      {range ? ` (${range})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Release Task button */}
            <div>
              <button
                className={`text-sm font-medium rounded px-4 py-2 ${
                  canRelease
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-indigo-200 text-white cursor-not-allowed"
                }`}
                disabled={!canRelease}
                onClick={onReleaseTask}
              >
                Release Task
              </button>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Notes history */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notes
              </label>
              <div className="w-full border rounded px-3 py-2 text-xs text-gray-800 bg-white h-32 overflow-auto whitespace-pre-line">
                {Array.isArray(task.Task_notes) && task.Task_notes.length > 0 ? (
                  // latest note first (reverse chrono)
                  [...task.Task_notes]
                    .slice()
                    .reverse()
                    .map((n, idx) => (
                      <div key={idx} className="mb-3 last:mb-0">
                        <div className="font-semibold">
                          [{n.datetime}] {n.status} - {n.author}
                        </div>
                        <div>
                          {n.message ? n.message : n.note || ""}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="text-gray-400 italic">No notes</div>
                )}
              </div>
            </div>

            {/* Add note */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Entry
              </label>
              <textarea
                className="w-full border rounded px-2 py-2 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                rows={3}
                placeholder="Insert Entry Here..."
                disabled={!canModifyCurrentState}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />

              <button
                className={`mt-2 text-sm font-medium rounded px-4 py-2 ${
                  canModifyCurrentState && noteDraft.trim()
                    ? "bg-gray-800 text-white hover:bg-gray-900"
                    : "bg-gray-300 text-white cursor-not-allowed"
                }`}
                disabled={!canModifyCurrentState || !noteDraft.trim()}
                onClick={handleAddNote}
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
