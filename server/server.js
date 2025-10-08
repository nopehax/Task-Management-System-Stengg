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

// TODO currently no hashing for simplicity
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
  return res.send("server is up and running :)")
})

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    
    const sql = 'SELECT id, email, username, password FROM accounts WHERE username = ? LIMIT 1';
    const [rows] = await pool.query(sql, [username]);

    if (!rows || rows.length === 0) {
      console.log('Invalid username for user:', username);
      return res.status(401).json({ error: 'Invalid username.' });
    }
    const user = rows[0];

    const ok = await compareHash(password, user.password);
    if (!ok) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid password.' });
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
    const token = "randomalphanumer1c"

    // Minimal user info back to the client
    console.log('Login successful: ', user.username);
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
      SELECT id, username, email, userGroup
      FROM accounts
      ORDER BY FIELD(userGroup, 'dev_team','project_manager','project_lead','admin'), id ASC
      `
    );
    console.log('Fetched users:', rows.length);
    return res.json(rows);
  } catch (err) {
    console.error("Get usersList error:", err);
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

// TODO add api to create user and update user fields

// ----- Start server -----
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Auth server listening on :${PORT}`);
});
