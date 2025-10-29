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

// Map current task state -> which application permit field controls actions/edits
// Closed is fully locked, so we won't even consult permits for Closed.
const PERMIT_FIELD_BY_STATE = {
  Open: "App_permit_Open",
  ToDo: "App_permit_ToDo",
  Doing: "App_permit_Doing",
  Done: "App_permit_Done",
  Closed: null,
};

// State transition definitions based on CURRENT state
// Each entry is an array of { label, toState }
const STATE_TRANSITIONS = {
  Open: [{ label: "Release Task", toState: "ToDo" }],
  ToDo: [{ label: "Pick Up Task", toState: "Doing" }],
  Doing: [
    { label: "Review Task", toState: "Done" },
    { label: "Drop Task", toState: "ToDo" },
  ],
  Done: [
    { label: "Approve Task", toState: "Closed" },
    { label: "Reject Task", toState: "Doing" },
  ],
  Closed: [],
};

export default function TaskPage() {
  const { ready, isAuthenticated, hasAnyGroup, user } = useAuth();

  // data
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [applications, setApplications] = useState([]);

  // UI state
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);

  // For the active task modal's plan editing behavior:
  // - origPlan: Task_plan value when modal opened
  // - editedPlan: user's currently selected plan in the modal (may differ in Done state)
  const [origPlan, setOrigPlan] = useState("");
  const [editedPlan, setEditedPlan] = useState("");

  // error messages
  const [createTaskError, setCreateTaskError] = useState("");
  const [createPlanError, setCreatePlanError] = useState("");
  const [taskModalError, setTaskModalError] = useState("");

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
    return hasAnyGroup(...allowed);
  }

  // can the current user act on a task in its *current* state?
  // This governs:
  // - state transition buttons
  // - Add Note
  // - plan editing (where allowed)
  function canUserActOnTask(task) {
    if (!task) return false;
    if (task.Task_state === "Closed") return false; // Closed is hard-locked
    const app = appMap[task.Task_app_acronym];
    if (!app || !hasAnyGroup) return false;
    const field = PERMIT_FIELD_BY_STATE[task.Task_state];
    if (!field) return false;
    const allowedGroups = app[field] || [];
    return hasAnyGroup(...allowedGroups);
  }

  // ----- MODAL OPEN/CLOSE -----

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

  // ----- CREATE PLAN SUBMIT -----
  async function handleCreatePlan(payload) {
    // payload = { Plan_MVP_name, Plan_app_acronym, Plan_startDate, Plan_endDate }
    try {
      const res = await api.post("/plans", payload);
      const created = res.data;
      if (created) {
        setPlans((prev) => [created, ...prev]);
        closeCreatePlan();
      }
    } catch (err) {
      setCreatePlanError(err.response?.data?.error);
      setTimeout(() => setCreatePlanError(""), 5000);
    }
  }

  // ----- CREATE TASK SUBMIT -----
  async function handleCreateTask(payload) {
    // payload = { Task_app_acronym, Task_name, Task_description, Task_plan }
    // Always create in "Open".
    try {
      const body = {
        Task_name: payload.Task_name,
        Task_description: payload.Task_description,
        Task_plan: payload.Task_plan || "",
        Task_app_acronym: payload.Task_app_acronym,
        Task_state: "Open",
        Task_creator: user.username || "",
      };

      const res = await api.post("/tasks", body);
      const createdTask = res.data;
      if (createdTask) {
        setTasks((prev) => [createdTask, ...prev]);
        closeCreateTask();
      }
    } catch (err) {
      setCreateTaskError(err.response?.data?.error);
      setTimeout(() => setCreateTaskError(""), 5000);
    }
  }

  // ----- ACTIVE TASK / MODAL-DERIVED STATE -----

  const activeTask = useMemo(() => {
    if (!activeTaskId) return null;
    return tasks.find((t) => t.Task_id === activeTaskId) || null;
  }, [activeTaskId, tasks]);

  // Sync origPlan / editedPlan whenever we open/switch task
  useEffect(() => {
    if (!activeTask) {
      setOrigPlan("");
      setEditedPlan("");
      return;
    }
    const initialPlan = activeTask.Task_plan || "";
    setOrigPlan(initialPlan);
    setEditedPlan(initialPlan);
  }, [activeTask]);

  // can current user modify this task in its current state?
  // (used for enabling Add Note, enabling plan dropdown in allowed states,
  // and enabling state transition buttons at all)
  const canModifyCurrentState = activeTask
    ? canUserActOnTask(activeTask)
    : false;

  // ----- PLAN EDITING MODES -----
  // "Open": plan can change
  // "ToDo" / "Doing": plan cannot change
  // "Done": plan can change, but we ONLY persist it if user hits "Reject Task"
  // "Closed": fully read-only
  const planMode = useMemo(() => {
    if (!activeTask) return "read-only";

    if (activeTask.Task_state === "Open" || activeTask.Task_state === "Done") {
      return canModifyCurrentState ? "edit-stash" : "read-only";
    }

    if (activeTask.Task_state === "Closed") {
      return "read-only";
    }

    // ToDo / Doing (and any other states not listed) => read-only
    return "read-only";
  }, [activeTask, canModifyCurrentState]);


  // For "Done" state: user can change dropdown locally
  // We already have setEditedPlan from useState for that.

  // ----- STATE ACTION BUTTONS -----

  // Build the actions for the footer of the modal:
  // depends on task.Task_state
  // Done state has special "Approve Task"/"Reject Task" rules
  const stateActions = useMemo(() => {
    if (!activeTask) return [];

    const baseDefs = STATE_TRANSITIONS[activeTask.Task_state] || [];
    // We will decorate each with `disabled`

    // helper to check if this specific action should be disabled
    function isActionDisabled(action) {
      // closed state => no actions anyway, but be safe
      if (activeTask.Task_state === "Closed") return true;

      // Must have permission on CURRENT state
      if (!canModifyCurrentState) return true;

      // Special rule in Done:
      // "Approve Task" (Done -> Closed) is disabled if editedPlan !== origPlan
      if (
        activeTask.Task_state === "Done" &&
        action.toState === "Closed"
      ) {
        if (editedPlan !== origPlan) return true;
      }

      return false;
    }

    return baseDefs.map((def) => ({
      ...def,
      disabled: isActionDisabled(def),
    }));
  }, [activeTask, canModifyCurrentState, editedPlan, origPlan]);

  // ----- PATCH HELPERS FOR STATE TRANSITIONS -----

  async function handleChangeTaskState(targetState) {
    if (!activeTask || !activeTaskId) return;
    if (!canModifyCurrentState) return;
    if (activeTask.Task_state === "Closed") return; // locked

    // We'll build the payload for PATCH based on current state & chosen target
    const currState = activeTask.Task_state;
    const payload = {};

    if (currState === "Done") {
      // Approve Task: Done -> Closed
      // Reject Task:  Done -> Doing
      if (targetState === "Closed") {
        // Approve Task:
        // Only allowed if editedPlan === origPlan (otherwise button disabled anyway)
        payload.Task_state = "Closed";
        // We do NOT send plan in Approve
      } else if (targetState === "Doing") {
        // Reject Task:
        // Always move state Done -> Doing
        payload.Task_state = "Doing";

        // If user changed plan in Done state, include it here
        if (editedPlan !== origPlan) {
          payload.Task_plan = editedPlan;
        }
      } else {
        // Unexpected transition from Done
        return;
      }
    } else {
      // All other states:
      //   Open -> ToDo
      //   ToDo -> Doing
      //   Doing -> Done / ToDo
      payload.Task_state = targetState;
      // No plan changes happen here (plan change in Open is handled live via handleImmediatePlanChange)
    }

    if (payload.Task_state === "ToDo") {
        payload.Task_plan = editedPlan;
    }

    try {
      const res = await api.patch(`/tasks/${activeTaskId}`, payload);
      const updated = res.data;
      if (updated) {
        setTasks((prev) =>
          prev.map((t) => (t.Task_id === updated.Task_id ? updated : t))
        );
        // After PATCH, the task may have moved to a new state, but we're
        // still looking at the same activeTaskId. The modal stays open.
        // orig/editedPlan will resync via useEffect.
      }
    } catch (err) {
      setTaskModalError(err.response?.data?.error);
      setTimeout(() => setTaskModalError(""), 5000);
    }
  }

  // ----- ADD NOTE -----

  async function handleAddNote(noteText) {
    if (!activeTaskId) return;
    if (!activeTask) return;
    if (activeTask.Task_state === "Closed") return;
    if (!canModifyCurrentState) return;

    // PATCH expects Task_notes as { author, status, note }
    const payload = {
      Task_notes: {
        author: user.username || "",
        status: activeTask.Task_state,
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
      setTaskModalError(err.response?.data?.error);
      setTimeout(() => setTaskModalError(""), 5000);
    }
  }

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
            // plan editing / selection
            planMode={planMode} // "read-only" | "edit-apply-now" | "edit-stash-for-reject"
            origPlan={origPlan}
            editedPlan={editedPlan}
            onSelectPlanLocal={setEditedPlan}
            // state change buttons
            stateActions={stateActions} // [{label,toState,disabled}, ...]
            onChangeState={handleChangeTaskState}
            // notes / perms
            canModifyCurrentState={canModifyCurrentState}
            onAddNote={handleAddNote}
            error={taskModalError}
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
            error={createTaskError}
          />
        ) : null}

        {/* Create Plan modal */}
        {showCreatePlan ? (
          <CreatePlanModal
            applications={applications}
            canCreatePlan={isProjectManager}
            onClose={closeCreatePlan}
            onCreate={handleCreatePlan}
            error={createPlanError}
          />
        ) : null}
      </div>
    </>
  );
}
