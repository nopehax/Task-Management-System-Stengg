// server.js — username PK + JSON userGroups + :username routes
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // kept for parity; hashing still bypassed
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cookieParser());

// ---------- CORS ----------
const corsOptions = {
  origin: "http://localhost:3001",
  credentials: true,
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-CSFR-Token"],
};
app.use(cors(corsOptions));

// ---------- MySQL ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
});

// ---------- Utils ----------
/** snake_case; allow [a-z0-9_.-]; clamp to 50 */
function normalizeGroup(name) {
  if (typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 50);
}
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
// Password policy unchanged: 8–10 chars
const isValidPass = (password) => {
  const pw = String(password ?? "");
  if (pw.length < 8 || pw.length > 10) return false;
  return /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':",.<>\/?]+$/.test(pw);
};
// KIV: no hashing (to match seed data)
const getHash = async (password) => String(password ?? "");
const compareHash = async (password, hash) => String(password ?? "") === String(hash ?? "");

// ---------- AuthN / AuthZ ----------
/** DB-backed: true iff user exists, active=1, and has ANY of the groups */
async function checkGroup(username, groupOrArray) {
  if (!username) return false;
  const allowed = (Array.isArray(groupOrArray) ? groupOrArray : [groupOrArray])
    .filter(Boolean);
  if (!allowed.length) return false;

  const [rows] = await pool.execute(
    "SELECT active, userGroups FROM accounts WHERE username = ? LIMIT 1",
    [username]
  );
  if (!rows || rows.length === 0) return false;
  const row = rows[0];
  if (!row.active) return false;

  let groups = [];
  try {
    groups = Array.isArray(row.userGroups) ? row.userGroups : JSON.parse(row.userGroups || "[]");
  } catch {
    groups = [];
  }
  return allowed.some((g) => groups.includes(g));
}

/** Cookie JWT → req.auth = { username, email, userGroups, active } */
function authRequired(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    const { username, email, userGroups, active } = payload || {};
    if (!username) throw new Error("bad payload");
    req.auth = {
      username,
      email: email || "",
      userGroups: Array.isArray(userGroups) ? userGroups : [],
      active: active ? 1 : 0,
    };
    return next();
  } catch {
    res.clearCookie("token", { httpOnly: true, sameSite: "lax", path: "/" });
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

/** Require ANY of the allowed groups (OR). Uses DB check so active/group flips take effect immediately. */
function requireGroup(allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const normalized = list.filter(Boolean);
  return async (req, res, next) => {
    const username = req.auth?.username;
    if (!username) return res.status(401).json({ error: "Not authenticated" });
    const ok = await checkGroup(username, normalized);
    if (!ok) return res.status(403).json({ error: "Not authorized" });
    return next();
  };
}

/** Issue JWT cookie with new payload */
function issueToken(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-secret", {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
  return token;
}

// -------------------------------- Routes --------------------------------

app.get("/api/check", async (_req, res) => {
  return res.send("server is up and running :)");
});

// --- Login: username PK; payload { username, email, userGroups[], active } ---
app.post("/api/login", async (req, res) => {
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
      return res.status(403).json({ error: "Invalid username or password." });
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
app.get("/api/me", authRequired, async (req, res) => {
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
app.post("/api/logout", (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.json({ ok: true });
});

// --- Admin: list users ---
app.get("/api/users", authRequired, requireGroup(["admin"]), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT username, email, active, userGroups FROM accounts ORDER BY username ASC"
    );
    const out = rows.map((r) => {
      let groups = [];
      try { groups = Array.isArray(r.userGroups) ? r.userGroups : JSON.parse(r.userGroups || "[]"); } catch {}
      return { username: r.username, email: r.email, active: !!r.active, userGroups: groups };
    });
    return res.json(out);
  } catch (err) {
    console.error("Get users error:", err);
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

// --- Catalog: list groups (any authed) ---
app.get("/api/usergroups", authRequired, async (_req, res) => {
  try {
    // catalog column name is `name` (VARCHAR(50) PRIMARY KEY)
    const [rows] = await pool.execute("SELECT name FROM userGroups ORDER BY name ASC");
    return res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error("Get userGroups error:", err);
    return res.status(500).json({ error: "Failed to fetch user groups." });
  }
});

// --- Catalog: add group (admin only) ---
app.post("/api/usergroups", authRequired, requireGroup(["admin"]), async (req, res) => {
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

// --- Admin: create user (>=1 valid groups) ---
app.post("/api/users", authRequired, requireGroup(["admin"]), async (req, res) => {
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

    const hash = await getHash(password);
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

// --- Admin: update user by :username (email/password/active/userGroups) ---
app.patch("/api/users/:username", authRequired, requireGroup(["admin"]), async (req, res) => {
  try {
    const username = req.params.username;
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

// --- Self profile: update /api/user/:username (email/password only) ---
app.patch(
  "/api/user/:username",
  authRequired,
  // gate to any known group; server still checks it's the same username
  requireGroup(["admin", "project_lead", "project_manager", "dev_team"]),
  async (req, res) => {
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

// ----------------------------- Startup -----------------------------
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server listening on :${PORT}`);
});
