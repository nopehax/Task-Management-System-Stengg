// src/components/CreateTaskModal.jsx
import React, { useMemo, useState } from "react";
import { formatPlanRange } from "../utils/date";

/**
 * CreateTaskModal
 *
 * Props:
 * - applications: array of application objects from /api/applications
 *   (must include App_Acronym and App_permit_Create at least)
 * - plans: array of plan objects from /api/plans
 * - onClose(): close modal
 * - onCreate(formData): attempt to create task
 *      formData = {
 *        Task_app_acronym,
 *        Task_name,
 *        Task_description,
 *        Task_plan, // "" or Plan_MVP_name
 *      }
 * - canUserCreate(appAcronym): boolean for permission gating
 */
export default function CreateTaskModal({
  applications,
  plans,
  onClose,
  onCreate,
  canUserCreate,
  error
}) {
  const [Task_app_acronym, setTaskApp] = useState("");
  const [Task_name, setTaskName] = useState("");
  const [Task_description, setTaskDesc] = useState("");
  const [Task_plan, setTaskPlan] = useState("");

  // We can optionally filter plan dropdown by chosen app,
  // so you only see plans for that application.
  const filteredPlans = useMemo(() => {
    if (!Task_app_acronym) return [];
    return plans.filter(
      (p) => p.Plan_app_acronym === Task_app_acronym
    );
  }, [Task_app_acronym, plans]);

  const isValidBasic =
    Task_app_acronym.trim() &&
    Task_name.trim() &&
    Task_description.trim();

  const isAuthorized = Task_app_acronym
    ? canUserCreate(Task_app_acronym)
    : false;

  const canSubmit = isValidBasic && isAuthorized;

  function handleSubmit() {
    if (!canSubmit) return;
    onCreate({
      Task_app_acronym,
      Task_name,
      Task_description,
      Task_plan, // "" or plan name
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-auto py-10 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="text-lg font-semibold text-gray-800">
            Create Task
          </div>
          <button
            className="text-sm font-semibold text-gray-700 bg-gray-200 rounded px-2 py-1 hover:bg-gray-300"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <div className="space-y-4">
          {/* Application */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Application
            </label>
            <select
              className="w-full border rounded px-2 py-2 text-sm bg-white"
              value={Task_app_acronym}
              onChange={(e) => {
                setTaskApp(e.target.value);
                // reset plan when switching application
                setTaskPlan("");
              }}
            >
              <option value="">Select an application...</option>
              {applications.map((app) => (
                <option key={app.App_Acronym} value={app.App_Acronym}>
                  {app.App_Acronym}
                </option>
              ))}
            </select>
          </div>

          {/* Task Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Task Name
            </label>
            <input
              className="w-full border rounded px-2 py-2 text-sm bg-white"
              value={Task_name}
              onChange={(e) => setTaskName(e.target.value)}
            />
          </div>

          {/* Task Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Task Description
            </label>
            <textarea
              className="w-full border rounded px-2 py-2 text-sm bg-white"
              rows={3}
              value={Task_description}
              onChange={(e) => setTaskDesc(e.target.value)}
            />
          </div>

          {/* Plan (optional) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Plan (optional)
            </label>
            <select
              className="w-full border rounded px-2 py-2 text-sm bg-white"
              value={Task_plan}
              onChange={(e) => setTaskPlan(e.target.value)}
            >
              <option value="">— No plan —</option>
              {filteredPlans.map((p) => {
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

          {/* Submit */}
          <div>
            <button
              className={`text-sm font-medium rounded px-4 py-2 ${
                canSubmit
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-indigo-200 text-white cursor-not-allowed"
              }`}
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              Create Task
            </button>

            {!isAuthorized && Task_app_acronym ? (
              <div className="text-xs text-red-600 mt-2">
                You are not permitted to create tasks for this application.
              </div>
            ) : null}
            {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
