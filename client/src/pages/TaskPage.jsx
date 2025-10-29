// src/pages/TaskPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../utils/authContext";

import TaskColumn from "../components/TaskColumn";
import TaskCard from "../components/TaskCard";
import TaskDetailModal from "../components/TaskDetailModal";
import CreateTaskModal from "../components/CreateTaskModal";
import CreatePlanModal from "../components/CreatePlanModal";
import HeaderPage from "../components/Header";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
  headers: { Accept: "application/json" },
});

// Map task state -> which application permit array controls actions
const PERMIT_FIELD_BY_STATE = {
  Open: "App_permit_Open",
  ToDo: "App_permit_ToDo",
  Doing: "App_permit_Doing",
  Done: "App_permit_Done",
  Closed: "App_permit_Done", // fallback until you define Closed-specific permit
};

// "Release Task" means move from Open -> ToDo
const RELEASE_TARGET_STATE = "ToDo";

export default function TaskPage() {
  const { ready, isAuthenticated, hasAnyGroup, username } = useAuth();

  // data
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [applications, setApplications] = useState([]);

  // UI state
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);

  const isProjectManager =
    hasAnyGroup && hasAnyGroup("project manager");

  // ---- LOAD DATA ----
  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    let mounted = true;
    (async () => {
      try {
        const [tasksRes, plansRes, appsRes] = await Promise.all([
          api.get("/tasks"),
          api.get("/plans"),
          api.get("/applications"),
        ]);

        if (!mounted) return;

        // expect arrays
        const taskList = Array.isArray(tasksRes.data)
          ? tasksRes.data
          : [];
        const planList = Array.isArray(plansRes.data)
          ? plansRes.data
          : [];
        const appList = Array.isArray(appsRes.data)
          ? appsRes.data
          : [];

        setTasks(taskList);
        setPlans(planList);
        setApplications(appList);
      } catch (err) {
        setTasks([]);
        setPlans([]);
        setApplications([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [ready, isAuthenticated]);

  // fast lookups
  const appMap = useMemo(() => {
    const m = {};
    applications.forEach((a) => {
      m[a.App_Acronym] = a;
    });
    return m;
  }, [applications]);

  const planMap = useMemo(() => {
    const m = {};
    plans.forEach((p) => {
      m[p.Plan_MVP_name] = p;
    });
    return m;
  }, [plans]);

  // group tasks by state for columns
  const tasksByState = useMemo(() => {
    const bucket = {
      Open: [],
      ToDo: [],
      Doing: [],
      Done: [],
      Closed: [],
    };
    tasks.forEach((t) => {
      if (!bucket[t.Task_state]) {
        bucket[t.Task_state] = [];
      }
      bucket[t.Task_state].push(t);
    });
    return bucket;
  }, [tasks]);

  // ----- PERMISSION HELPERS -----

  // can the current user create tasks for a given application?
  function canUserCreateTaskForApp(appAcronym) {
    const app = appMap[appAcronym];
    if (!app || !hasAnyGroup) return false;
    const allowed = app.App_permit_Create || [];
    return hasAnyGroup(allowed);
  }

  // can the current user act on a task in its *current* state?
  // used to enable: Add Note, changing plan dropdown, etc.
  function canUserModifyCurrentTask(task) {
    const app = appMap[task.Task_app_acronym];
    if (!app || !hasAnyGroup) return false;
    const field = PERMIT_FIELD_BY_STATE[task.Task_state];
    if (!field) return false;
    const allowedGroups = app[field] || [];
    return hasAnyGroup(allowedGroups);
  }

  // can the current user "Release Task" (Open -> ToDo)?
  function canUserReleaseTask(task) {
    // If the task is already not Open, maybe we hide/disable anyway.
    if (task.Task_state !== "Open") return false;
    const app = appMap[task.Task_app_acronym];
    if (!app || !hasAnyGroup) return false;
    // releasing to ToDo means check App_permit_ToDo
    const field = PERMIT_FIELD_BY_STATE[RELEASE_TARGET_STATE];
    if (!field) return false;
    const allowedGroups = app[field] || [];
    return hasAnyGroup(allowedGroups);
  }

  // ----- EVENT HANDLERS -----

  function openTaskModal(taskId) {
    setActiveTaskId(taskId);
  }
  function closeTaskModal() {
    setActiveTaskId(null);
  }

  function openCreateTask() {
    setShowCreateTask(true);
  }
  function closeCreateTask() {
    setShowCreateTask(false);
  }

  function openCreatePlan() {
    setShowCreatePlan(true);
  }
  function closeCreatePlan() {
    setShowCreatePlan(false);
  }

  // Create Plan submit
  async function handleCreatePlan(payload) {
    // payload = { Plan_MVP_name, Plan_app_acronym, Plan_startDate, Plan_endDate }
    try {
      const res = await api.post("/plans", payload);
      const created = res.data; // single plan object
      if (created) {
        setPlans((prev) => [created, ...prev]);
        closeCreatePlan();
      }
    } catch (err) {
      // surface server error message here in future if needed
      // (e.g. toast or inline)
    }
  }

  // Create Task submit
  async function handleCreateTask(payload) {
    // payload = { Task_app_acronym, Task_name, Task_description, Task_plan }
    // We always create in "Open".
    // Backend expects:
    //   Task_name
    //   Task_description
    //   Task_plan ("" allowed)
    //   Task_app_acronym
    //   Task_state ("Open")
    //   Task_creator (username)
    try {
      const body = {
        Task_name: payload.Task_name,
        Task_description: payload.Task_description,
        Task_plan: payload.Task_plan || "",
        Task_app_acronym: payload.Task_app_acronym,
        Task_state: "Open",
        Task_creator: username || "", // from auth context
      };

      const res = await api.post("/tasks", body);
      const createdTask = res.data; // single task object
      if (createdTask) {
        setTasks((prev) => [createdTask, ...prev]);
        closeCreateTask();
      }
    } catch (err) {
      // in future, show err.response?.data?.error under the button
    }
  }

  // Update task plan (dropdown in detail modal)
  async function handleChangePlan(newPlanNameOrEmpty) {
    if (!activeTaskId) return;
    try {
      const res = await api.patch(`/tasks/${activeTaskId}`, {
        Task_plan: newPlanNameOrEmpty, // "" or Plan_MVP_name
      });
      const updated = res.data;
      if (updated) {
        setTasks((prev) =>
          prev.map((t) => (t.Task_id === updated.Task_id ? updated : t))
        );
      }
    } catch (err) {
      // optional: surface error
    }
  }

  // Release Task (Open -> ToDo)
  async function handleReleaseTask() {
    if (!activeTaskId) return;
    try {
      const res = await api.patch(`/tasks/${activeTaskId}`, {
        Task_state: RELEASE_TARGET_STATE,
      });
      const updated = res.data;
      if (updated) {
        setTasks((prev) =>
          prev.map((t) => (t.Task_id === updated.Task_id ? updated : t))
        );
        // After successful release, we could keep modal open (to see notes, etc.)
      }
    } catch (err) {
      // optional: handle 403, etc.
    }
  }

  // Add Note
  async function handleAddNote(noteText) {
    if (!activeTaskId) return;
    // PATCH expects Task_notes as a single note object with keys:
    // { author, status, note } (backend will inject datetime)
    // - author: username
    // - status: current state of task
    // - note: noteText
    const currentTask = tasks.find((t) => t.Task_id === activeTaskId);
    if (!currentTask) return;

    const payload = {
      Task_notes: {
        author: username || "",
        status: currentTask.Task_state,
        note: noteText,
      },
    };

    try {
      const res = await api.patch(`/tasks/${activeTaskId}`, payload);
      const updated = res.data;
      if (updated) {
        setTasks((prev) =>
          prev.map((t) => (t.Task_id === updated.Task_id ? updated : t))
        );
      }
    } catch (err) {
      // optional: show error
    }
  }

  // Active task details (for modal)
  const activeTask = useMemo(() => {
    if (!activeTaskId) return null;
    return tasks.find((t) => t.Task_id === activeTaskId) || null;
  }, [activeTaskId, tasks]);

  // derived permissions for the active task
  const canModifyCurrentState = activeTask
    ? canUserModifyCurrentTask(activeTask)
    : false;
  const canRelease = activeTask
    ? canUserReleaseTask(activeTask)
    : false;

  if (!ready) return null;
  if (!isAuthenticated) return null;

  return (
    <>
    <HeaderPage />
    <div className="p-6 mx-auto">
      {/* Header row: "Kanban" + Add Plan */}
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-800">Kanban</h1>

        {isProjectManager ? (
          <button
            className="text-sm font-medium bg-indigo-600 text-white rounded px-3 py-2 hover:bg-indigo-700"
            onClick={openCreatePlan}
          >
            + Add Plan
          </button>
        ) : null}
      </div>

      {/* Board columns */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-start gap-4 lg:gap-0 lg:space-x-4">
        {/* Open */}
        <TaskColumn
          title="Open"
          onAddTask={openCreateTask}
          showAddTaskButton={true}
        >
          {tasksByState.Open.map((t) => (
            <TaskCard
              key={t.Task_id}
              task={t}
              plan={planMap[t.Task_plan]}
              onClick={() => openTaskModal(t.Task_id)}
            />
          ))}
        </TaskColumn>

        {/* To-Do */}
        <TaskColumn title="To-Do">
          {tasksByState.ToDo.map((t) => (
            <TaskCard
              key={t.Task_id}
              task={t}
              plan={planMap[t.Task_plan]}
              onClick={() => openTaskModal(t.Task_id)}
            />
          ))}
        </TaskColumn>

        {/* Doing */}
        <TaskColumn title="Doing">
          {tasksByState.Doing.map((t) => (
            <TaskCard
              key={t.Task_id}
              task={t}
              plan={planMap[t.Task_plan]}
              onClick={() => openTaskModal(t.Task_id)}
            />
          ))}
        </TaskColumn>

        {/* Done */}
        <TaskColumn title="Done">
          {tasksByState.Done.map((t) => (
            <TaskCard
              key={t.Task_id}
              task={t}
              plan={planMap[t.Task_plan]}
              onClick={() => openTaskModal(t.Task_id)}
            />
          ))}
        </TaskColumn>

        {/* Closed */}
        <TaskColumn title="Closed">
          {tasksByState.Closed.map((t) => (
            <TaskCard
              key={t.Task_id}
              task={t}
              plan={planMap[t.Task_plan]}
              onClick={() => openTaskModal(t.Task_id)}
            />
          ))}
        </TaskColumn>
      </div>

      {/* Task detail modal */}
      {activeTask ? (
        <TaskDetailModal
          task={activeTask}
          plans={plans}
          onClose={closeTaskModal}
          onChangePlan={handleChangePlan}
          onReleaseTask={handleReleaseTask}
          onAddNote={handleAddNote}
          canModifyCurrentState={canModifyCurrentState}
          canRelease={canRelease}
        />
      ) : null}

      {/* Create Task modal */}
      {showCreateTask ? (
        <CreateTaskModal
          applications={applications}
          plans={plans}
          onClose={closeCreateTask}
          onCreate={handleCreateTask}
          canUserCreate={canUserCreateTaskForApp}
        />
      ) : null}

      {/* Create Plan modal */}
      {showCreatePlan ? (
        <CreatePlanModal
          applications={applications}
          canCreatePlan={isProjectManager}
          onClose={closeCreatePlan}
          onCreate={handleCreatePlan}
        />
      ) : null}
    </div>
    </>
  );
}
