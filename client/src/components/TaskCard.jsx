// src/components/TaskCard.jsx
import React from "react";
import { formatPlanRange } from "../utils/date";

export default function TaskCard({ task, plan, onClick }) {
  // task: { Task_id, Task_name, Task_plan, Task_creator, ... }
  // plan: { Plan_MVP_name, Plan_startDate, Plan_endDate, ... } or undefined

  const rangeDisplay = plan
    ? formatPlanRange(plan.Plan_startDate, plan.Plan_endDate)
    : "";

  return (
    <div
      className="bg-white border rounded-lg shadow-sm p-4 mb-4 cursor-pointer hover:shadow"
      onClick={onClick}
    >
      {/* ID + Name */}
      <div className="text-sm font-semibold text-gray-800 mb-2">
        {task.Task_id} : {task.Task_name}
      </div>

      {/* Plan pill */}
      {plan && (
        <div className="inline-block text-[11px] px-2 py-[2px] rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 mb-3">
          {plan.Plan_MVP_name}
        </div>
      )}

      {/* Plan date range */}
      {plan && rangeDisplay && (
        <div className="text-xs text-gray-700 mb-2">{rangeDisplay}</div>
      )}

      {/* Created by */}
      <div className="text-[11px] text-gray-600">
        Created by: {task.Task_creator || "-"}
      </div>
    </div>
  );
}
