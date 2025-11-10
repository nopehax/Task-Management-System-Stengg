// src/components/CreatePlanModal.jsx
import React, { useState } from "react";

/**
 * CreatePlanModal
 *
 * Props:
 * - applications: array of application objects [{App_Acronym, ...}]
 * - canCreatePlan: boolean (is user "project manager")
 * - onClose()
 * - onCreate({ Plan_MVP_name, Plan_app_acronym, Plan_startDate, Plan_endDate })
 */
export default function CreatePlanModal({
  applications,
  canCreatePlan,
  onClose,
  onCreate,
  error
}) {
  const [Plan_MVP_name, setName] = useState("");
  const [Plan_app_acronym, setAcronym] = useState("");
  const [Plan_startDate, setStart] = useState("");
  const [Plan_endDate, setEnd] = useState("");

  const fieldsValid =
    Plan_MVP_name.trim() &&
    Plan_app_acronym.trim() &&
    Plan_startDate &&
    Plan_endDate;

  const canSubmit = canCreatePlan && fieldsValid;

  function handleSubmit() {
    if (!canSubmit) return;
    onCreate({
      Plan_MVP_name,
      Plan_app_acronym,
      Plan_startDate,
      Plan_endDate,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-auto py-10 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="text-lg font-semibold text-gray-800">
            Create Plan
          </div>
          <button
            className="text-sm font-semibold text-gray-700 bg-gray-200 rounded px-2 py-1 hover:bg-gray-300"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <div className="space-y-4">
          {/* Plan Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Plan Name
            </label>
            <input
              className="w-full border rounded px-2 py-2 text-sm bg-white"
              value={Plan_MVP_name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Application */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Application
            </label>
            <select
              className="w-full border rounded px-2 py-2 text-sm bg-white"
              value={Plan_app_acronym}
              onChange={(e) => setAcronym(e.target.value)}
            >
              <option value="">Select an application...</option>
              {applications.map((app) => (
                <option key={app.App_Acronym} value={app.App_Acronym}>
                  {app.App_Acronym}
                </option>
              ))}
            </select>
          </div>

          {/* Date row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                className="w-full border rounded px-2 py-2 text-sm bg-white"
                value={Plan_startDate}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                className="w-full border rounded px-2 py-2 text-sm bg-white"
                value={Plan_endDate}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Submit */}
          <div>
            <button
              className={`text-sm font-medium rounded px-4 py-2 ${canSubmit
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-indigo-200 text-white cursor-not-allowed"
                }`}
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              Create Plan
            </button>

            {!canCreatePlan ? (
              <div className="text-xs text-red-600 mt-2">
                You are not permitted to create plans.
              </div>
            ) : null}

            {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
