// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json())
app.use(helmet());

// // cors
app.use(cors({
  // origin: "http://localhost:3001"
}))

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

// TODO JWT auth middleware
function requireAuth(req, res, next) {
  return next(); // TEMP DISABLE AUTH
  const hdr = req.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
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

app.get('/api/check', async (req, res) => {
  console.log("Health check OK")
  return res.send("server is up and running :)")
})

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    
    const sql = 'SELECT id, email, username, password FROM accounts WHERE username = ? LIMIT 1';
    const [rows] = await pool.query(sql, [username]);

    let isValid = true;
    if (!rows || rows.length === 0) {
      isValid = false;
    }

    const user = rows[0];
    const ok = await compareHash(password, user.password);
    if (!ok) {
      isValid = false;
    }
    if (!isValid) {
      console.log('Unsuccessful login attempt by user: ', username);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // // Sign JWT
    // const token = jwt.sign(
    //   {
    //     sub: String(user.id),
    //     role: user.role || 'user',
    //   },
    //   process.env.JWT_SECRET,
    //   {
    //     expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    //     issuer: process.env.JWT_ISSUER || 'server',
    //     audience: process.env.JWT_AUDIENCE || 'my-frontend',
    //   }
    // );
    const token = "somerandomalphanumer1c"

    console.log('Login successful:', user.username);
    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
});

app.get("/api/users", async (_req, res) => {
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

app.post("/api/users", requireAuth, async (req, res) => {
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

app.patch("/api/users/:id", requireAuth, async (req, res) => {
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

// ----- Start server -----
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server listening on :${PORT}`);
});
