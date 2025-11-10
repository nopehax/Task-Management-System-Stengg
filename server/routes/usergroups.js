// src/routes/usergroups.js
const express = require('express');
const router = express.Router();

const { pool } = require('../config/db');
const { authRequired, requireGroup } = require('../middleware/auth');

/** lowercase, max 50 char */
function normalizeGroup(name) {
  if (typeof name !== "string") return "";
  return name.trim().toLowerCase();
}

// get userGroups catalog
router.get('/usergroups', authRequired, async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT name FROM userGroups ORDER BY name ASC");
    return res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error("Get userGroups error:", err);
    return res.status(500).json({ error: "Failed to fetch user groups." });
  }
});

// add new userGroup to catalog
router.post('/usergroups', authRequired, requireGroup(['admin']), async (req, res) => {
  const raw = req.body?.groupName;
  if (!raw || typeof raw !== "string") {
    return res.status(400).json({ error: "groupName is required" });
  }

  const groupName = normalizeGroup(raw);
  if (!groupName) return res.status(400).json({ error: "Invalid group name" });
  if (groupName.length > 50) return res.status(400).json({ error: "Group name should be <50 char." });

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      try {
        await conn.execute("INSERT INTO userGroups (name) VALUES (?)", [groupName]);
        await conn.commit();
        conn.release();
        return res.status(201).json({ groupName });
      } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
          await conn.rollback();
          conn.release();
          return res.status(200).json({ groupName });
        }
        throw err; // let outer catch handle retry/500
      }

    } catch (err) {
      try { await conn.rollback(); } catch { }
      conn.release();

      if (
        err &&
        (err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT") &&
        attempt < maxRetries
      ) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue;
      }

      console.error("Add userGroup error:", err);
      return res.status(500).json({ error: "Failed to add user group." });
    }
  }
});


module.exports = router;
