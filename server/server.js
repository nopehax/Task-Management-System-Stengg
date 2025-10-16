// server.js — app entry (refactor of monolith, no behavior changes)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const userGroupsRoutes = require('./routes/usergroups');

const corsOptions = {
  origin: "http://localhost:3001",
  credentials: true,
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-CSFR-Token"],
};

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cookieParser());
app.use(cors(corsOptions));

// routes
app.get('/api/check', async (_req, res) => res.sendStatus(200).send("server is up and running"));
app.use('/api', authRoutes);
app.use('/api', usersRoutes);
app.use('/api', userGroupsRoutes);

// startup
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server listening on :${PORT}`);
});
