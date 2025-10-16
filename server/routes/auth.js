const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { pool } = require('../config/db');
const { authRequired, issueToken } = require('../middleware/auth');

const compareHash = async (password, hash) => bcrypt.compare(password, hash);

// --- Login: returns { username, email, userGroups[], active } on success ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    const [rows] = await pool.execute(
      "SELECT username, email, password, active, userGroups FROM accounts WHERE username = ? LIMIT 1",
      [username]
    );
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password." });
    }
    const u = rows[0];
    if (!u.active) {
      return res.status(403).json({ error: "Inactive account" });
    }
    if (!(await compareHash(password, u.password))) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    let groups = [];
    try {
      groups = Array.isArray(u.userGroups) ? u.userGroups : JSON.parse(u.userGroups || "[]");
    } catch {
      groups = [];
    }

    const payload = {
      username: u.username,
      email: u.email,
      userGroups: groups,
      active: !!u.active,
    };
    issueToken(res, payload);
    return res.json({ user: payload });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

// --- Session: verify cookie, re-check active, return fresh data ---
router.get('/me', authRequired, async (req, res) => {
  try {
    const username = req.auth.username;
    const [rows] = await pool.execute(
      "SELECT username, email, active, userGroups FROM accounts WHERE username = ? LIMIT 1",
      [username]
    );
    if (!rows || rows.length === 0) {
      res.clearCookie("token", { httpOnly: true, sameSite: "lax", path: "/" });
      return res.status(401).json({ error: "User not found" });
    }
    const u = rows[0];
    if (!u.active) {
      res.clearCookie("token", { httpOnly: true, sameSite: "lax", path: "/" });
      return res.status(401).json({ error: "Invalid token" });
    }
    let groups = [];
    try {
      groups = Array.isArray(u.userGroups) ? u.userGroups : JSON.parse(u.userGroups || "[]");
    } catch {
      groups = [];
    }
    return res.json({
      user: { username: u.username, email: u.email, userGroups: groups, active: !!u.active },
    });
  } catch (err) {
    console.error("/api/me error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// --- Logout ---
router.post('/logout', (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.json({ ok: true });
});

module.exports = router;
