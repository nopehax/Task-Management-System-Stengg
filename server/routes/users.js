const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { pool } = require('../config/db');
const { authRequired, requireGroup } = require('../middleware/auth');

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
const isValidPass = (password) => {
  const pw = String(password ?? "");
  if (pw.length < 8 || pw.length > 10) return false;
  return /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':",.<>\/?]+$/.test(pw);
};

const normalizeStr = (name) => name.trim().toLowerCase();
const getHash = async (password) => await bcrypt.hash(password, 12);
const compareHash = async (password, hash) => bcrypt.compare(password, hash);

// Admin: get userList
router.get('/users', authRequired, requireGroup(['admin']), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT username, email, active, userGroups FROM accounts ORDER BY username ASC"
    );
    const out = rows.map((r) => {
      let groups = [];
      groups = Array.isArray(r.userGroups) ? r.userGroups : JSON.parse(r.userGroups || "[]");
      return { username: r.username, email: r.email, active: !!r.active, userGroups: groups };
    });
    return res.json(out);
  } catch (err) {
    console.error("Get users error:", err);
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

// Admin: create new user
router.post('/users', authRequired, requireGroup(['admin']), async (req, res) => {
  try {
    const { username, email, password, userGroups, active = 1 } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: "username, email, and password are required" });
    }
    if (!isValidPass(password)) {
      return res.status(400).json({ error: "Password does not meet requirements." });
    }

    // default groups = ["dev_team"] if not provided
    let groups = Array.isArray(userGroups) ? userGroups : ["dev_team"];
    groups = groups.filter(Boolean);
    if (groups.length === 0) return res.status(400).json({ error: "At least one group is required" });

    // validate against catalog
    const [catalogRows] = await pool.execute("SELECT name FROM userGroups");
    const catalog = new Set(catalogRows.map((r) => r.name));
    const invalid = groups.filter((g) => !catalog.has(g));
    if (invalid.length) return res.status(400).json({ error: "Unknown groups: " + invalid.join(", ") });

    const hash = await getHash(String(password));
    await pool.execute(
      "INSERT INTO accounts (username, password, email, userGroups, active) VALUES (?,?,?,?,?)",
      [username, hash, email, JSON.stringify(groups), active ? 1 : 0]
    );

    return res.status(201).json({ username, email, userGroups: groups, active: !!active });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    console.error("Create user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Admin: update user by :username (email/password/active/userGroups)
router.patch('/users/:username', authRequired, requireGroup(['admin']), async (req, res) => {
  try {
    const username = normalizeStr(req.params.username);
    if (!username) return res.status(400).json({ error: "Invalid username" });
    const incoming = req.body || {};

    const sets = [];
    const values = [];

    if (incoming.email !== undefined) {
      if (!isValidEmail(incoming.email)) return res.status(400).json({ error: "Invalid email format." });
      sets.push("`email` = ?"); values.push(incoming.email);
    }
    if (incoming.active !== undefined) {
      sets.push("`active` = ?"); values.push(incoming.active ? 1 : 0);
    }
    if (incoming.userGroups !== undefined) {
      let groups = Array.isArray(incoming.userGroups) ? incoming.userGroups : [];
      groups = groups.filter(Boolean);
      if (username === "admin" && !groups.includes("admin")) {
        return res.status(400).json({ error: "Cannot remove admin rights from this user" });
      }
      if (groups.length === 0) return res.status(400).json({ error: "At least one group is required" });

      const [catalogRows] = await pool.execute("SELECT name FROM userGroups");
      const catalog = new Set(catalogRows.map((r) => r.name));
      const invalid = groups.filter((g) => !catalog.has(g));
      if (invalid.length) return res.status(400).json({ error: "Unknown groups: " + invalid.join(", ") });

      sets.push("`userGroups` = ?"); values.push(JSON.stringify(groups));
    }
    if (incoming.password !== undefined) {
      const raw = String(incoming.password ?? "");
      if (!isValidPass(raw)) return res.status(400).json({ error: "Password does not meet requirements." });
      const hash = await getHash(raw);
      sets.push("`password` = ?"); values.push(hash);
    }

    if (sets.length === 0) return res.status(400).json({ error: "No updatable fields provided" });
    values.push(username);

    const sql = `UPDATE accounts SET ${sets.join(", ")} WHERE username = ? LIMIT 1`;
    const [result] = await pool.execute(sql, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });

    const [rows] = await pool.execute(
      "SELECT username, email, active, userGroups FROM accounts WHERE username = ? LIMIT 1",
      [username]
    );
    const row = rows[0];
    let groups = [];
    try { groups = Array.isArray(row.userGroups) ? row.userGroups : JSON.parse(row.userGroups || "[]"); } catch {}
    return res.json({ username: row.username, email: row.email, active: !!row.active, userGroups: groups });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error("Patch user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Self profile: update own email/password only
router.patch('/user/:username',
  authRequired, async (req, res) => {
    try {
      const username = req.params.username;
      if (!username) return res.status(400).json({ error: "Invalid username" });
      if (req.auth.username !== username) {
        return res.status(403).json({ error: "Not authorized to update this profile" });
      }

      const incoming = req.body || {};
      const sets = [];
      const values = [];

      if (incoming.email !== undefined) {
        if (!isValidEmail(incoming.email)) return res.status(400).json({ error: "Invalid email format." });
        sets.push("`email` = ?"); values.push(incoming.email);
      }

      if (incoming.password !== undefined) {
        const raw = String(incoming.password ?? "");
        if (!isValidPass(raw)) return res.status(400).json({ error: "Password does not meet requirements." });
        const cur = String(incoming.currentPassword ?? "");
        if (!cur) return res.status(400).json({ error: "Current password is required to set a new password." });

        const [rows] = await pool.execute("SELECT password FROM accounts WHERE username = ? LIMIT 1", [username]);
        if (!rows || rows.length === 0) return res.status(404).json({ error: "User not found" });
        const currentHash = rows[0].password;
        if (!(await compareHash(cur, currentHash))) {
          return res.status(400).json({ error: "Current password is incorrect." });
        }
        const hash = await getHash(raw);
        sets.push("`password` = ?"); values.push(hash);
      }

      if (sets.length === 0) return res.status(400).json({ error: "No updatable fields provided" });

      values.push(username);
      const sql = `UPDATE accounts SET ${sets.join(", ")} WHERE username = ? LIMIT 1`;
      const [result] = await pool.execute(sql, values);
      if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });

      const [rows2] = await pool.execute(
        "SELECT username, email, active, userGroups FROM accounts WHERE username = ? LIMIT 1",
        [username]
      );
      const row = rows2[0];
      let groups = [];
      try { groups = Array.isArray(row.userGroups) ? row.userGroups : JSON.parse(row.userGroups || "[]"); } catch {}
      return res.json({ username: row.username, email: row.email, active: !!row.active, userGroups: groups });
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Email already exists" });
      }
      console.error("Patch self user error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
