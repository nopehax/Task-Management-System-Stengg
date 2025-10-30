// server/routes/tasks.js
const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const { authRequired, checkGroup } = require("../middleware/auth");

function isIsoDateString(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// util: normalize DB row -> JS object
function normalizeTaskRow(row) {
  let parsedNotes;
  if (row.Task_notes == null || row.Task_notes === "") {
    parsedNotes = {};
  } else if (typeof row.Task_notes === "object") {
    // mysql2 may already give JSON columns as objects
    parsedNotes = row.Task_notes;
  } else {
    try {
      parsedNotes = JSON.parse(row.Task_notes);
    } catch {
      parsedNotes = {};
    }
  }

  return {
    Task_id: row.Task_id,
    Task_name: row.Task_name,
    Task_description: row.Task_description,
    Task_notes: parsedNotes,
    Task_plan: row.Task_plan || "",
    Task_app_acronym: row.Task_app_acronym,
    Task_state: row.Task_state,
    Task_owner: row.Task_owner,
    Task_creator: row.Task_creator,
    Task_createDate: row.Task_createDate || "",
  };
}

function isValidState(s) {
  return s === "Open" || s === "ToDo" || s === "Doing" || s === "Done" || s === "Closed";
}

// helper: validate Task_notes shape
function isValidNotes(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  // required keys author/status/datetime/note as strings
  const requiredKeys = ["author", "status", "note"];
  for (const k of requiredKeys) {
    if (!(k in obj)) return false;
    if (typeof obj[k] !== "string") return false;
  }
  return true;
}

function todayIsoDate(full=false) {
  const d = new Date();
  if (full) return d;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const getCurrNote = async (taskId, conn) => {
  const [rows] = await conn.query(
    `SELECT Task_notes
      FROM tasks
      WHERE Task_id = ?
      LIMIT 1
      FOR UPDATE;`,
    [taskId]
  );
  if (!rows.length) return null;
  return rows[0].Task_notes;
}

/**
 * GET /api/tasks
 * Any authenticated user can view all tasks.
 * Returns bare array of tasks, sorted by Task_createDate ascending.
 */
router.get("/tasks", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Task_id,
              Task_name,
              Task_description,
              Task_notes,
              Task_plan,
              Task_app_acronym,
              Task_state,
              Task_creator,
              Task_owner,
              Task_createDate
         FROM tasks
         ORDER BY Task_createDate ASC`
    );

    const data = rows.map(normalizeTaskRow);
    return res.json(data);
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    return res.status(500).json({ error: "Failed to load tasks" });
  }
});

/**
 * POST /api/tasks
 * Only userGroups in the target application's App_permit_Create can create a task.
 *
 * Flow (in a transaction):
 * 1. Validate incoming fields (except Task_id / Task_createDate which are server-generated)
 * 2. Load application row FOR UPDATE:
 *    - confirm application exists
 *    - get App_Rnumber and App_permit_Create
 *    - check req.auth.userGroups ∩ App_permit_Create
 * 3. Compute new Task_id = <Task_app_acronym>_<App_Rnumber+1>
 *    and new App_Rnumber = App_Rnumber+1
 * 4. Confirm referenced plan exists
 * 5. Insert new task with auto Task_createDate = today (yyyy-MM-dd)
 * 6. Update application's App_Rnumber = new value
 * 7. Commit
 * 8. Return the inserted task object
 */
router.post("/tasks", authRequired, async (req, res) => {
  // pull body
  const {
    Task_name,
    Task_description,
    Task_plan,
    Task_app_acronym,
    Task_state,
    Task_creator,
    // Task_id and Task_createDate are NOT accepted from client
  } = req.body || {};

  // Synchronous (non-DB) validation first
  if (
    !Task_name ||
    typeof Task_name !== "string" ||
    Task_name.length > 50
  ) {
    return res
      .status(400)
      .json({ error: "Invalid Task_name (max 50 chars)" });
  }

  if (
    typeof Task_description !== "string" ||
    Task_description.length > 255
  ) {
    return res
      .status(400)
      .json({ error: "Invalid Task_description (max 255 chars)" });
  }

  if (
    typeof Task_plan !== "string" ||
    Task_plan.length > 50
  ) {
    return res
      .status(400)
      .json({ error: "Invalid Task_plan (max 50 chars)" });
  }

  if (
    !Task_app_acronym ||
    typeof Task_app_acronym !== "string" ||
    Task_app_acronym.length > 50
  ) {
    return res.status(400).json({
      error: "Invalid Task_app_acronym (max 50 chars)",
    });
  }

  if (!isValidState(Task_state)) {
    return res.status(400).json({
      error: "Invalid Task_state",
    });
  }

  if (
    !Task_creator ||
    typeof Task_creator !== "string" ||
    Task_creator.length > 50
  ) {
    return res
      .status(400)
      .json({ error: "Invalid Task_creator (max 50 chars)" });
  }

  // check if user is allowed to create a task in this application.
  const task_owner = "(unassigned)";
  const [rows] = await pool.query(
    `SELECT App_permit_Create
      FROM applications
      WHERE App_acronym = ?
      LIMIT 1`,
    [Task_app_acronym.trim()]
  );
  const allowedGroups = rows[0].App_permit_Create || "[]";
  if (!checkGroup(req.auth?.username, allowedGroups)) {
    return res.status(403).json({ error: "Not authorized" });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // compute Task_id and incremented App_Rnumber
    const [appRows] = await conn.query(
      `SELECT App_Rnumber
         FROM applications
        WHERE App_Acronym = ?
        LIMIT 1`,
      [Task_app_acronym.trim()]
    )
    const currentR = Number(appRows[0].App_Rnumber ?? 0);
    const newR = currentR + 1;
    const newTaskId = `${Task_app_acronym.trim()}_${newR}`;

    // 5. Ensure Task_plan exists in plans
    const [planRows] = await conn.query(
      `SELECT 1
         FROM plans
        WHERE Plan_MVP_name = ?
        LIMIT 1`,
      [Task_plan.trim()]
    );
    if (Task_plan && !planRows.length) {
      await conn.rollback();
      return res.status(400).json({
        error: "Referenced plan does not exist",
      });
    }

    // 6. Insert task
    const createDate = todayIsoDate(); // yyyy-MM-dd
    if (!isIsoDateString(createDate)) {
      await conn.rollback();
      return res
        .status(500)
        .json({ error: "Internal date generation error" });
    }

    const insertSql = `
      INSERT INTO tasks
        (Task_name,
         Task_description,
         Task_notes,
         Task_id,
         Task_plan,
         Task_app_acronym,
         Task_state,
         Task_creator,
         Task_owner,
         Task_createDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const insertParams = [
      Task_name.trim(),
      Task_description.trim(),
      JSON.stringify([]),
      newTaskId,
      Task_plan.trim() || null,
      Task_app_acronym.trim(),
      Task_state,
      Task_creator.trim(),
      task_owner.trim(),
      createDate,
    ];
    await conn.query(insertSql, insertParams);

    // 7. Update application's App_Rnumber
    await conn.query(
      `UPDATE applications
          SET App_Rnumber = ?
        WHERE App_Acronym = ?`,
      [newR, Task_app_acronym.trim()]
    );

    // 8. Read back the inserted row
    const [rows] = await conn.query(
      `SELECT Task_id,
              Task_name,
              Task_description,
              Task_notes,
              Task_plan,
              Task_app_acronym,
              Task_state,
              Task_creator,
              Task_owner,
              Task_createDate
         FROM tasks
        WHERE Task_id = ?
        LIMIT 1`,
      [newTaskId]
    );

    if (!rows.length) {
      await conn.rollback();
      return res
        .status(500)
        .json({ error: "Failed to read created task" });
    }

    const record = normalizeTaskRow(rows[0]);

    // commit and return
    await conn.commit();
    return res.status(201).json(record);
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Task already exists" });
    }
    console.error("POST /api/tasks error:", err);
    return res.status(500).json({ error: "Failed to create task" });
  } finally {
    if (conn) conn.release();
  }
});

/**
 * PATCH /api/tasks/:taskId
 * only permitted userGroup of the current task state can update the task
 *
 * Editable fields:
 *   - Task_plan         (must exist in plans)
 *   - Task_owner        (assigned to whoever picks up the task)
 *   - Task_state        (must be one of enum)
 *   - Task_notes        (must still be valid object)
 *
 */
router.patch("/tasks/:taskId", authRequired, async (req, res) => {
  const { taskId } = req.params;
  const acronym = taskId.split("_")[0];
  const {
    Task_plan,
    Task_state,
    Task_notes,
    // everything else is ignored
  } = req.body || {};

  // check that user is allowed to edit this task
  let [rows] = await pool.query(
        `SELECT Task_state
           FROM tasks
          WHERE Task_id = ?
          LIMIT 1`,
        [taskId]
      );
  const taskCurrState = rows[0].Task_state
  const permit = 'App_permit_' + taskCurrState;
  [rows] = await pool.query(
    `SELECT ?
      FROM applications
      WHERE App_Acronym = ?
      LIMIT 1`,
    [permit,acronym]
  );
  if (!rows.length) {
    return res.status(500).json({ error: "Failed to read application" });
  }
  const allowedGroups = rows[0][permit] || "[]";
  if (!checkGroup(req.auth.username, allowedGroups)) {
    return res.status(403).json({ error: "Not authorized" });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // We build updates dynamically but validate each field first.

    const updates = [];
    const params = [];

    // Task_plan (optional but must exist)
    if (typeof Task_plan !== "undefined") {
      if (
        !Task_plan ||
        typeof Task_plan !== "string" ||
        Task_plan.length > 50
      ) {
        await conn.rollback();
        return res
          .status(400)
          .json({ error: "Invalid Task_plan (max 50 chars)" });
      }

      // check plan exists
      const [planRows] = await conn.query(
        `SELECT 1
           FROM plans
          WHERE Plan_MVP_name = ?
          LIMIT 1`,
        [Task_plan.trim()]
      );
      if (!planRows.length) {
        await conn.rollback();
        return res.status(400).json({
          error: "Referenced plan does not exist",
        });
      }

      updates.push("Task_plan = ?");
      params.push(Task_plan.trim());
    }

    // Task_owner (if base on last touch)
    // const taskOwner = req.auth.username;
    // updates.push("Task_owner = ?");
    // params.push(taskOwner.trim());

    // Task_state (optional)
    if (typeof Task_state !== "undefined") {
      if (!isValidState(Task_state)) {
        await conn.rollback();
        return res.status(400).json({ error: "Invalid Task_state" });
      }

      // check that target state is allowed from current state
      if (Task_state === "ToDo") {
        if (!Task_plan) {
          await conn.rollback();
          return res.status(400).json({
            error: "A plan is required to move to release task",
          });
        }
        if (!(taskCurrState === "Open" || taskCurrState === "Doing")) {
          console.log("taskCurrState", taskCurrState)
          await conn.rollback();
          return res.status(400).json({
            error: "Cannot move task from " + taskCurrState + " to ToDo",
          });
        }
        const taskOwner = "(unassigned)";
        updates.push("Task_owner = ?");
        params.push(taskOwner.trim());
      }
      if (Task_state === "Doing") {
        if (!(taskCurrState === "ToDo" || taskCurrState == "Done")) {
          await conn.rollback();
          return res.status(400).json({
            error: "Cannot move task from " + taskCurrState + " to Doing",
          });
        }
        const taskOwner = req.auth.username;
        updates.push("Task_owner = ?");
        params.push(taskOwner.trim());
      }
      if (Task_state === "Done") {
        if (taskCurrState !== "Doing") {
          await conn.rollback();
          return res.status(400).json({
            error: "Cannot move task from " + taskCurrState + " to Done",
          });
        }
      }
      if (Task_state === "Closed") {
        if (taskCurrState !== "Done") {
          await conn.rollback();
          return res.status(400).json({
            error: "Cannot move task from " + taskCurrState + " to Closed",
          });
        }
      }
      
      const stateChangeNote = {
        author: req.auth.username,
        status: taskCurrState,
        datetime: new Date().toISOString(),
        message: `Task state changed from "${taskCurrState}" to "${Task_state}"`,
      }
      const currNote = await getCurrNote(taskId, conn)
      const newNote = [...currNote, stateChangeNote]
      updates.push("Task_notes = ?");
      params.push(JSON.stringify(newNote));
      updates.push("Task_state = ?");
      params.push(Task_state);
    }

    // Task_notes (optional)
    if (typeof Task_notes !== "undefined") {
      if (!isValidNotes(Task_notes)) {
        await conn.rollback();
        return res.status(400).json({
          error:
            "Invalid Task_notes; must include {author,status,note} as strings",
        });
      }
      const withDatetime = {
        ...Task_notes,
        datetime: new Date().toISOString(),
      }
      const currNote = await getCurrNote(taskId, conn)
      const newNote = [...currNote, withDatetime]
      updates.push("Task_notes = ?");
      params.push(JSON.stringify(newNote));
    }

    // If there are no editable fields in the body, just read & return current task
    if (updates.length === 0) {
      const [curRows] = await conn.query(
        `SELECT Task_id,
                Task_name,
                Task_description,
                Task_notes,
                Task_plan,
                Task_app_acronym,
                Task_state,
                Task_creator,
                Task_owner,
                Task_createDate
           FROM tasks
          WHERE Task_id = ?
          LIMIT 1`,
        [taskId]
      );

      if (!curRows.length) {
        await conn.rollback();
        return res.status(404).json({ error: "Task not found" });
      }

      const currentRecord = normalizeTaskRow(curRows[0]);
      await conn.commit();
      return res.json(currentRecord);
    }

    // Apply update
    const updateSql = `
      UPDATE tasks
         SET ${updates.join(", ")}
       WHERE Task_id = ?
    `;
    params.push(taskId);

    const [result] = await conn.query(updateSql, params);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Task not found" });
    }

    // Read back updated row
    const [rows] = await conn.query(
      `SELECT Task_id,
              Task_name,
              Task_description,
              Task_notes,
              Task_plan,
              Task_app_acronym,
              Task_state,
              Task_creator,
              Task_owner,
              Task_createDate
         FROM tasks
        WHERE Task_id = ?
        LIMIT 1`,
      [taskId]
    );

    if (!rows.length) {
      await conn.rollback();
      return res
        .status(500)
        .json({ error: "Failed to read updated task" });
    }

    const record = normalizeTaskRow(rows[0]);
    await conn.commit();
    return res.json(record);
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    console.error("PATCH /api/tasks/:taskId error:", err);
    return res.status(500).json({ error: "Failed to update task" });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
