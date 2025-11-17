// server.js — app entry (refactor of monolith, no behavior changes)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const userGroupsRoutes = require('./routes/usergroups');
const applicationsRoutes = require('./routes/applications');
const plansRoutes = require('./routes/plans');
const tasksRoutes = require('./routes/tasks');


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
app.get('/api/check', async (_req, res) => res.status(200).json({ status: "OK", message: "server is up and running", time: new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) }));
app.use('/api', authRoutes);
app.use('/api', usersRoutes);
app.use('/api', userGroupsRoutes);
app.use('/api', applicationsRoutes);
app.use('/api', plansRoutes);
app.use('/api', tasksRoutes);

// for unknown endpoints
app.use((req, res) => {
  res.status(404).json({ status: 'U_1' });
});

// startup
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server listening on :${PORT}`);
});
