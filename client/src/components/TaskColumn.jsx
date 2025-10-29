// src/components/TaskColumn.jsx
import React from "react";

export default function TaskColumn({
  title,
  children,
  onAddTask,
  showAddTaskButton,
}) {
  return (
    <div className="flex-1 min-w-[240px] bg-white border border-gray-200 rounded-md shadow-sm flex flex-col mr-4 last:mr-0">
      {/* Column header */}
      <div className="flex items-start justify-between bg-gray-50 rounded-t-md px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-800">{title}</div>

        {showAddTaskButton ? (
          <button
            className="text-xs font-medium bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700"
            onClick={onAddTask}
          >
            + Add Task
          </button>
        ) : null}
      </div>

      {/* Column body */}
      <div className="px-4 py-3 flex-1">
        {React.Children.count(children) === 0 ? (
          <div className="text-sm italic text-gray-400">No Tasks</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
