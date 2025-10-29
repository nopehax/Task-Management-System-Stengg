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
 * - plans: array of all plans
 *   [{Plan_MVP_name, Plan_startDate, Plan_endDate, Plan_app_acronym}, ...]
 *
 * - onClose(): close modal
 *
 * - planMode:
 *   "read-only"
 *   "edit-apply-now"           // state=Open: PATCH immediately on change
 *   "edit-stash-for-reject"    // state=Done: stage locally, only send on Reject
 *
 * - origPlan: string (task.Task_plan when modal opened)
 * - editedPlan: string (current dropdown selection in the modal UI)
 * - onImmediatePlanChange(newPlanNameOrEmpty): PATCH immediately (Open only)
 * - onSelectPlanLocal(newPlanNameOrEmpty): update editedPlan in parent (Done only)
 *
 * - stateActions: array of { label, toState, disabled }
 *   e.g. [{ label:"Release Task", toState:"ToDo", disabled:false }]
 *   For "Done": [
 *     { label:"Approve Task", toState:"Closed", disabled:(plan changed?) },
 *     { label:"Reject Task",  toState:"Doing",  disabled:false }
 *   ]
 *   For "Closed": []
 *
 * - onChangeState(targetState): called when clicking any state action button.
 *   Special cases are handled in TaskPage (Done->Doing also applies staged plan if changed)
 *
 * - canModifyCurrentState: boolean
 *   Controls:
 *   - whether Add Note box is enabled
 *   - whether dropdown is enabled in allowed modes
 *
 * - onAddNote(noteText): PATCH append note
 */
export default function TaskDetailModal({
  task,
  plans,
  onClose,
  planMode,
  origPlan,
  editedPlan,
  onImmediatePlanChange,
  onSelectPlanLocal,
  stateActions,
  onChangeState,
  canModifyCurrentState,
  onAddNote,
  error
}) {
  const [noteDraft, setNoteDraft] = useState("");

  const createdOnDisplay = task.Task_createDate
    ? formatDisplayDate(task.Task_createDate)
    : "";

  const isClosed = task.Task_state === "Closed";

  // --- Plan dropdown handling ---
  // The dropdown is:
  // - disabled completely in read-only mode OR Closed OR when user lacks permission
  // - in "edit-apply-now": value = task.Task_plan; onChange -> PATCH immediately
  // - in "edit-stash-for-reject": value = editedPlan; onChange -> just stage locally
  //
  const planDropdownDisabled =
    planMode === "read-only" || isClosed || !canModifyCurrentState;

  const planSelectValue =
    planMode === "edit-stash-for-reject"
      ? editedPlan || ""
      : task.Task_plan || "";

  function handlePlanSelect(e) {
    const newVal = e.target.value; // "" or Plan_MVP_name
    if (planMode === "edit-apply-now") {
      // Open state: apply immediately
      onImmediatePlanChange(newVal);
    } else if (planMode === "edit-stash-for-reject") {
      // Done state: just stage locally
      onSelectPlanLocal(newVal);
    }
    // read-only mode won't trigger because dropdown is disabled
  }

  // --- Notes handling ---
  function handleAddNote() {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setNoteDraft("");
  }

  // --- Render ---

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
                <div className="text-gray-800">
                  {createdOnDisplay || "—"}
                </div>
              </div>
            </div>

            {/* Plan selector */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Plan:
              </label>

              <select
                className="w-full border rounded px-2 py-2 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                value={planSelectValue}
                onChange={handlePlanSelect}
                disabled={planDropdownDisabled}
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

            {/* State action buttons (Release Task / Pick Up Task / etc) */}
            <div className="flex flex-wrap gap-2">
              {stateActions && stateActions.length > 0 ? (
                stateActions.map((action, idx) => (
                  <button
                    key={idx}
                    className={`text-sm font-medium rounded px-4 py-2 ${
                      action.disabled
                        ? "bg-indigo-200 text-white cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                    disabled={action.disabled}
                    onClick={() => {
                      if (!action.disabled) {
                        onChangeState(action.toState);
                      }
                    }}
                  >
                    {action.label}
                  </button>
                ))
              ) : (
                // In Closed state or no available actions, render nothing
                null
              )}
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
            {!isClosed && (
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
            )}
          </div>
        </div>

        {error && <div className="text-red-600">{error}</div>}
      </div>
    </div>
  );
}
