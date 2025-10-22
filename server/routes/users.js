const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { pool } = require('../config/db');
const { authRequired, requireGroup } = require('../middleware/auth');

const isValidEmail = (email) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email || "");
const isValidPass = (password) => {
  const pw = String(password ?? "");
  return /^(?=.{8,10}$)(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])\S+$/.test(pw);
};

const normalizeStr = (name) => name.trim().toLowerCase();
const getHash = async (password) => await bcrypt.hash(password, 12);
const compareHash = async (password, hash) => bcrypt.compare(password, hash);

// Admin: get userList
router.get('/users', authRequired, requireGroup(['admin']), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT username, email, active, userGroups FROM accounts"
    );
    const out = rows.map((r) => {
      let groups = [];
      groups = Array.isArray(r.userGroups) ? r.userGroups : JSON.parse(r.userGroups || "[]");
      return { username: r.username, email: r.email, active: !!r.active, userGroups: groups };
    });
    return res.json(out);
  } catch (err) {
    console.error("Get userList error:", err);
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

// Admin: create new user
router.post('/users', authRequired, requireGroup(['admin']), async (req, res) => {
  const { username, email, password, userGroups, active = 1 } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Field(s) cannot be empty." });
  }
  if (username.length > 50) {
    return res.status(400).json({ error: "Username must not be longer than 50 characters." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Email must be valid." });
  }
  if (!isValidPass(password)) {
    return res.status(400).json({ error: "Password must be 8–10 characters long and include at least one letter, one number, and one special character." });
  }

  // Validate groups against catalog
  const groups = Array.isArray(userGroups) ? userGroups : [];
  if (groups.length > 0) {
    const [catalogRows] = await pool.execute("SELECT name FROM userGroups");
    const catalog = new Set(catalogRows.map(r => r.name));
    const invalid = groups.filter(g => !catalog.has(g));
    if (invalid.length) {
      return res.status(400).json({ error: "Unknown groups: " + invalid.join(", ") });
    }
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Insert user
      const hash = await getHash(String(password));
      await conn.execute(
        "INSERT INTO accounts (username, password, email, userGroups, active) VALUES (?,?,?,?,?)",
        [username, hash, email, JSON.stringify(groups), active ? 1 : 0]
      );

      await conn.commit();
      conn.release();
      return res.status(201).json({ username, email, userGroups: groups, active: !!active });

    } catch (err) {
      // Roll back + release before handling
      try { await conn.rollback(); } catch {}
      conn.release();

      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Username or email already exists" });
      }

      // Retry on deadlock/timeout
      if (err && (err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT") && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue;
      }

      console.error("Create user error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
});

// Admin: update user by :username (email/password/active/userGroups)
router.patch('/users/:username', authRequired, requireGroup(['admin']), async (req, res) => {
  const username = normalizeStr(req.params.username);
  if (!username) return res.status(400).json({ error: "Invalid username" });

  const incoming = req.body || {};
  const updates = [];
  const values  = [];

  if (incoming.email !== undefined) {
    if (!isValidEmail(incoming.email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }
    updates.push("`email` = ?"); values.push(incoming.email);
  }

  if (incoming.active !== undefined) {
    if (username === "admin" && !incoming.active) {
      return res.status(400).json({ error: "Cannot deactivate the original admin." });
    }
    updates.push("`active` = ?"); values.push(incoming.active ? 1 : 0);
  }

  let groupsPayload;
  if (incoming.userGroups !== undefined) {
    let groups = Array.isArray(incoming.userGroups) ? incoming.userGroups : [];
    groups = groups.filter(Boolean);
    if (username === "admin" && !groups.includes("admin")) {
      return res.status(400).json({ error: "Cannot remove admin group from original admin." });
    }
    if (groups.length > 0) {
    const [catalogRows] = await pool.execute("SELECT name FROM userGroups");
    const catalog = new Set(catalogRows.map(r => r.name));
    const invalid = groups.filter(g => !catalog.has(g));
    if (invalid.length) {
      return res.status(400).json({ error: "Unknown groups: " + invalid.join(", ") });
    }
  }
    groupsPayload = groups;
    updates.push("`userGroups` = ?"); values.push(JSON.stringify(groupsPayload));
  }

  let passwordHashToSet = null;
  if (incoming.password !== undefined) {
    const raw = String(incoming.password ?? "");
    if (!isValidPass(raw)) {
      return res.status(400).json({ error: "Password must be 8–10 characters long and include at least one letter, one number, and one special character." });
    }
    // hash outside tx is fine; keeps tx short
    passwordHashToSet = await getHash(raw);
    updates.push("`password` = ?");
    values.push(passwordHashToSet);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No updatable fields provided" });
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Perform the update
      const sql = `UPDATE accounts SET ${updates.join(", ")} WHERE username = ? LIMIT 1`;
      const params = [...values, username];
      const [result] = await conn.execute(sql, params);

      if (result.affectedRows === 0) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: "User not found" });
      }

      // Fetch canonical row to return
      const [rows] = await conn.execute(
        "SELECT username, email, active, userGroups FROM accounts WHERE username = ? LIMIT 1",
        [username]
      );
      if (!rows || rows.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: "User not found" });
      }
      const row = rows[0];
      let groups;
      groups = Array.isArray(row.userGroups) ? row.userGroups : JSON.parse(row.userGroups || "[]");

      await conn.commit();
      conn.release();
      return res.json({
        username: row.username,
        email: row.email,
        active: !!row.active,
        userGroups: groups
      });

    } catch (err) {
      try { await conn.rollback(); } catch {}
      conn.release();

      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Email already exists" });
      }

      if (err && (err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT") && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue; // retry the transaction
      }

      console.error("Patch user error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
});

// Self profile: update own email/password only
router.patch('/user/:username', authRequired, async (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: "Invalid username" });
  if (req.auth.username !== username) {
    return res.status(403).json({ error: "Not authorized to update this profile" });
  }

  const incoming = req.body || {};
  const updates = [];
  const values  = [];

  // validation checks first)
  if (incoming.email !== undefined) {
    if (!isValidEmail(incoming.email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }
    updates.push("`email` = ?"); values.push(incoming.email);
  }

  let newPasswordHash = null;
  let newPasswordRaw  = null;
  if (incoming.password !== undefined) {
    const raw = String(incoming.password ?? "");
    if (!isValidPass(raw)) {
      return res.status(400).json({ error: "Password must be 8–10 characters long and include at least one letter, one number, and one special character." });
    }
    const cur = String(incoming.currentPassword ?? "");
    if (!cur) {
      return res.status(400).json({ error: "Current password is required to set a new password." });
    }
    newPasswordRaw  = raw;
    newPasswordHash = await getHash(raw);
    updates.push("`password` = ?");
    values.push(newPasswordHash);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No updatable fields provided" });
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // If password change requested, verify current password against a locked row
      if (newPasswordHash !== null) {
        const [rows] = await conn.execute(
          "SELECT password FROM accounts WHERE username = ? LIMIT 1",
          [username]
        );
        if (!rows || rows.length === 0) {
          await conn.rollback(); conn.release();
          return res.status(404).json({ error: "User not found" });
        }
        const currentHash = rows[0].password;
        const cur = String(incoming.currentPassword ?? "");
        const ok = await compareHash(cur, currentHash);
        if (!ok) {
          await conn.rollback(); conn.release();
          return res.status(400).json({ error: "Current password is incorrect." });
        }
      }

      // Apply updates
      const sql = `UPDATE accounts SET ${updates.join(", ")} WHERE username = ? LIMIT 1`;
      const params = [...values, username];
      const [result] = await conn.execute(sql, params);
      if (result.affectedRows === 0) {
        await conn.rollback(); conn.release();
        return res.status(404).json({ error: "User not found" });
      }

      // Read back canonical row
      const [userRows] = await conn.execute(
        "SELECT username, email, active, userGroups FROM accounts WHERE username = ? LIMIT 1",
        [username]
      );
      if (!userRows || userRows.length === 0) {
        await conn.rollback(); conn.release();
        return res.status(404).json({ error: "User not found" });
      }

      const row = userRows[0];
      let groups;
      groups = Array.isArray(row.userGroups) ? row.userGroups : JSON.parse(row.userGroups || "[]");

      await conn.commit();
      conn.release();

      return res.json({
        username: row.username,
        email: row.email,
        active: !!row.active,
        userGroups: groups,
      });

    } catch (err) {
      try { await conn.rollback(); } catch {}
      conn.release();

      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Email already exists" });
      }
      if (
        err &&
        (err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT") &&
        attempt < maxRetries
      ) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue; // retry transaction
      }

      console.error("Patch self user error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
});

module.exports = router;
