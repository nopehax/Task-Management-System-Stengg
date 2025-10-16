// src/routes/usergroups.js
const express = require('express');
const router = express.Router();

const { pool } = require('../config/db');
const { authRequired, requireGroup } = require('../middleware/auth');

/** snake_case, max 50 char */
function normalizeGroup(name) {
  if (typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 50);
}

// --- get userGroups catalog ---
router.get('/usergroups', authRequired, async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT name FROM userGroups ORDER BY name ASC");
    return res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error("Get userGroups error:", err);
    return res.status(500).json({ error: "Failed to fetch user groups." });
  }
});

// --- add new userGroup to catalog ---
router.post('/usergroups', authRequired, requireGroup(['admin']), async (req, res) => {
  try {
    const raw = req.body?.groupName;
    if (!raw || typeof raw !== "string") return res.status(400).json({ error: "groupName is required" });
    const groupName = normalizeGroup(raw);
    if (!groupName) return res.status(400).json({ error: "Invalid group name" });
    if (groupName.length > 50) return res.status(400).json({ error: "group name too long" });

    try {
      await pool.execute("INSERT INTO userGroups (name) VALUES (?)", [groupName]);
      return res.status(201).json({ groupName });
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(200).json({ groupName });
      }
      throw err;
    }
  } catch (err) {
    console.error("Add userGroup error:", err);
    return res.status(500).json({ error: "Failed to add user group." });
  }
});

module.exports = router;
