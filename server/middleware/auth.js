// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// true iff user exists, active=1, and has ANY of the groups
async function checkGroup(username, groupOrArray) {
  if (!username) return false;
  const allowed = (Array.isArray(groupOrArray) ? groupOrArray : [groupOrArray]).filter(Boolean);
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

// Cookie JWT → req.auth = { username, email, userGroups, active }
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

// allowedGroups filter middleware for endpoints
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

// Issue JWT cookie with new payload
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

module.exports = {
  authRequired,
  requireGroup,
  checkGroup,
  issueToken,
};
