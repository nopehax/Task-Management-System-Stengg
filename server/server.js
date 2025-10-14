// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json())
app.use(helmet());
app.use(cookieParser());

// cors

const corsOptions = {
  origin: "http://localhost:3001",
  credentials: true,
  methods: ['GET','POST','PATCH'],
  allowedHeaders: ['Content-Type','Authorization', 'Accept', 'X-CSFR-Token'],
};

app.use(cors(corsOptions));

// mysql pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
});

const checkGroup = async (userId, needGroup) => {
  const [rows] = await pool.query(
    'SELECT userGroup, active FROM accounts WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!rows || rows.length === 0) return false;

  const { userGroup, active } = rows[0];
  if (!active) return false;
  if (userGroup !== needGroup) return false;
  return true;
}


// --- JWT Auth Middleware using cookies ---
const authRequired = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    console.log('token not found in cookie')
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { id: Number(payload.sub), username: payload.username || '' };
    return next();
  } catch {
    // Optional: clear bad/expired cookie
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
    });
    console.log('token invalid or expired')
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// Authorization middleware factory: require that the current user belongs to
// at least one of the supplied groups (case-insensitive).
// Usage: app.post('/api/users', authRequired, requireGroup(['admin','project_lead']), handler)
const requireGroup = (allowed, opts = {}) => {
  const allowedSet = new Set(
    (Array.isArray(allowed) ? allowed : [allowed])
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
  );

  return async function (req, res, next) {
    try {
      const userId = req.auth?.id; // set by your authRequired (JWT verify)
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      for (const grp of allowedSet) {
        if (await checkGroup(userId, grp)) {
          return next();
        }
      }
      return res.status(403).json({ error: 'Not authorized' });
    } catch (err) {
      console.error('requireGroup error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  };
}


const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
}

const isValidPass = (password) => {
    if (password.length < 8 || password.length > 10) return false
    const re = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':",.<>\/?]+$/
    return re.test(password)
}

// KIV currently no hashing for simplicity
const getHash = async (password) => {
  return password
  const hash = await bcrypt.hash(password,10)
  console.log("Generated hash:", hash)
  return hash
}

const compareHash = async (password, hash) => {
  return password === hash
  return await bcrypt.compare(password, hash)
}


// ------------------------------------------ Routes ----------------------------------------------------


app.get('/api/check', async (req, res) => {
  console.log("Health check OK")
  return res.send("server is up and running :)")
})

// --- Login: issue JWT in cookie ---
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const sql = 'SELECT id, email, username, password, active, userGroup FROM accounts WHERE username = ? LIMIT 1';
    const [rows] = await pool.query(sql, [username]);
    if (!rows || rows.length === 0) {
      console.log('login unsuccessful: wrong username');
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const user = rows[0];
    if (!user.active) {
      console.log('login unsuccessful: inactive user');
      return res.status(403).json({ error: 'Invalid username or password.' });
    }
     if (!(await compareHash(password, user.password))) {
      console.log('login unsuccessful: wrong password');
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    console.log('username and password match');
    // Sign JWT
    const token = jwt.sign(
      { sub: String(user.id), username: user.username, userGroup: user.userGroup },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // if true, only transmit cookie over https; no need for localhost
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
      // maxAge: 10000 // 10s
    });
    console.log('Login successful:', user.username);
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        userGroup: user.userGroup,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

// verify JWT from cookie and return current user
app.get('/api/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, email, userGroup, active FROM accounts WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows || rows.length === 0) {
      // (optional) clear cookie if user no longer exists
      res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return res.status(401).json({ error: 'User not found' });
    }

    const u = rows[0];
    if (!u.active) {
      res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return res.status(401).json({ error: 'Invalid token' });
    } else {
      return res.json({
        user: {
          id: u.id,
          username: u.username,
          email: u.email,
          userGroup: u.userGroup,
          active: !!u.active,
        },
      });
    }
  } catch (err) {
    console.error('/api/me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// --- Logout: clear JWT cookie ---
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get("/api/users", authRequired, requireGroup(['admin']), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, username, email, userGroup, active
      FROM accounts
      ORDER BY id ASC
      `
    );
    console.log('userList fetched, count:', rows.length);
    return res.json(rows);
  } catch (err) {
    console.error("Get usersList error:", err);
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

app.get("/api/usergroups", authRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT groupName FROM userGroups`);
    console.log("userGroups fetched, count:", rows.length);
    return res.json(rows.map(r => r.groupName));
  } catch (err) {
    console.error("Get userGroups error:", err);
    return res.status(500).json({ error: "Failed to fetch user groups." });
  }
});

// Add a new group to userGroups table
app.post("/api/usergroups", authRequired, requireGroup(['admin']), async (req, res) => {
  try {
    const { groupName } = req.body || {};
    if (!groupName || typeof groupName !== "string" || !groupName.trim()) {
      return res.status(400).json({ error: "groupName is required" });
    }
    try {
      const [result] = await pool.execute("INSERT INTO userGroups (groupName) VALUES (?)", [groupName]);
      console.log("Created new userGroup:", groupName);
      return res.status(201).json({ groupName });
    } catch (err) {
      // If duplicate, just return OK
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

app.post("/api/users", authRequired, requireGroup(['admin']), async (req, res) => {
  try {
    const { username, email, password, userGroup = "dev_team", active = 1 } = req.body || {};
    if (!username || !email || !password) {
      console.log("Missing required field(s)");
      return res.status(400).json({ error: "username, email, and password are required" });
    }
    const hash = await getHash(password);

    const sql =
      "INSERT INTO `accounts` (`username`,`password`,`email`,`userGroup`,`active`) VALUES (?,?,?,?,?)";
    const params = [username, hash, email, userGroup, active ? 1 : 0];
    const [result] = await pool.execute(sql, params);

    console.log("Created user:", username);
    return res.status(201).json({
      id: result.insertId,
      username,
      email,
      userGroup,
      active: !!active,
    });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    console.error("Create user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/users/:id", authRequired, requireGroup(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const allowed = ["username", "email", "userGroup", "active", "password"];
    const incoming = req.body || {};

    // Build SET clause dynamically
    const sets = [];
    const values = [];

    for (const key of allowed) {
      if (incoming[key] === undefined) continue;

      if (key === "password") {
        const raw = String(incoming.password ?? "");
        if (!isValidPass(raw)) {
          return res.status(400).json({ error: "Password does not meet requirements." });
        }
        const hash = await getHash(raw);
        sets.push("`password` = ?");
        values.push(hash);
      } else if (key === "active") {
        sets.push("`active` = ?");
        values.push(incoming.active ? 1 : 0);
      } else if (key === "userGroup") {
        sets.push("`userGroup` = ?");
        values.push(incoming.userGroup);
      } else {
        sets.push("`" + key + "` = ?");
        values.push(incoming[key]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    values.push(id);
    const sql = `UPDATE \`accounts\` SET ${sets.join(", ")} WHERE \`id\` = ? LIMIT 1`;
    const [result] = await pool.execute(sql, values);

    if (result.affectedRows === 0) {
      console.log("[PATCH] User not found for id:", id);
      return res.status(404).json({ error: "User not found" });
    }

    // Return the updated row (sans password)
    const [rows] = await pool.execute(
      "SELECT `id`,`username`,`email`,`userGroup`,`active` FROM `accounts` WHERE `id`=? LIMIT 1",
      [id]
    );
    console.log("Updated user id:", id);
    return res.json(rows[0]);
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    console.error("Patch user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/user/:id", authRequired, requireGroup(['admin', 'project_lead', 'project_manager', 'dev_team']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    // users can only update their own profile
    if (req.auth.id !== id) {
      return res.status(403).json({ error: "Not authorized to update this profile" });
    }
    const allowed = ["email", "password", "currentPassword"];
    const incoming = req.body || {};
    // Build SET clause dynamically
    const sets = [];
    const values = [];
    let currentHash = null;

    for (const key of allowed) {
      if (incoming[key] === undefined) continue;
      if (key === "password") {
        const raw = String(incoming.password ?? "");
        if (!isValidPass(raw)) {
          return res.status(400).json({ error: "Password does not meet requirements." });
        }
        if (!incoming.currentPassword) {
          return res.status(400).json({ error: "Current password is required to set a new password." });
        }
        if (currentHash === null) {
          // fetch current hash
          const [rows] = await pool.execute(
            "SELECT `password` FROM `accounts` WHERE `id`=? LIMIT 1",
            [id]
          );
          if (!rows || rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
          }
          currentHash = rows[0].password;
        }
        if (!(await compareHash(incoming.currentPassword, currentHash))) {
          return res.status(400).json({ error: "Current password is incorrect." });
        }
        const hash = await getHash(raw);
        sets.push("`password` = ?");
        values.push(hash);
      } else if (key === "email") {
        if (!isValidEmail(incoming.email)) {
          return res.status(400).json({ error: "Invalid email format." });
        } 
        sets.push("`email` = ?");
        values.push(incoming.email);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }
    values.push(id);
    const sql = `UPDATE \`accounts\` SET ${sets.join(", ")} WHERE \`id\` = ? LIMIT 1`;
    const [result] = await pool.execute(sql, values);
    if (result.affectedRows === 0) {
      console.log("[PATCH] User not found for id:", id);
      return res.status(404).json({ error: "User not found" });
    }
    // Return the updated row (sans password)
    const [rows] = await pool.execute(
      "SELECT `id`,`username`,`email`,`userGroup`,`active` FROM `accounts` WHERE `id`=? LIMIT 1",
      [id]
    );
    console.log("Updated user id:", id);
    return res.json(rows[0]);
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error("Patch user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ----- Start server -----
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server listening on :${PORT}`);
});
