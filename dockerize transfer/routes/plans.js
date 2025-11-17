// server/routes/plans.js
const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const { authRequired, requireGroup } = require("../middleware/auth");

// --- helpers ---

function isIsoDateString(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalizeRow(row) {
  // MySQL DATE columns will come back as 'YYYY-MM-DD'
  return {
    Plan_MVP_name: row.Plan_MVP_name,
    Plan_startDate: row.Plan_startDate || "",
    Plan_endDate: row.Plan_endDate || "",
    Plan_app_acronym: row.Plan_app_acronym,
  };
}

// --- GET /api/plans ---
// Any authenticated user can view all plans.
// Sort by startDate, latest (newest) at the top.
router.get("/plans", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Plan_MVP_name,
              Plan_startDate,
              Plan_endDate,
              Plan_app_acronym
         FROM plans
         ORDER BY Plan_startDate DESC`
    );

    const data = rows.map(normalizeRow);
    // bare array response
    res.json(data);
  } catch (err) {
    console.error("GET /api/plans error:", err);
    res.status(500).json({ error: "Failed to load plans" });
  }
});

// --- POST /api/plans ---
// Only "project manager" can create plans.
// All fields mandatory.
// Dates must be yyyy-MM-dd and start <= end.
// Plan_app_acronym must reference an existing application.
router.post(
  "/plans",
  authRequired,
  requireGroup(["project manager"]),
  async (req, res) => {
    try {
      const {
        Plan_MVP_name,
        Plan_startDate,
        Plan_endDate,
        Plan_app_acronym,
      } = req.body || {};

      // Validate name
      if (
        !Plan_MVP_name ||
        typeof Plan_MVP_name !== "string" ||
        Plan_MVP_name.length > 50
      ) {
        return res
          .status(400)
          .json({ error: "Invalid Plan_MVP_name (max 50 chars)" });
      }

      // Validate acronym
      if (
        !Plan_app_acronym ||
        typeof Plan_app_acronym !== "string" ||
        Plan_app_acronym.length > 50
      ) {
        return res.status(400).json({
          error: "Invalid Plan_app_acronym (max 50 chars)",
        });
      }

      // Validate dates
      if (!isIsoDateString(Plan_startDate) || !isIsoDateString(Plan_endDate)) {
        return res
          .status(400)
          .json({ error: "Dates must be in yyyy-MM-dd format" });
      }

      // start <= end
      const [sy, sm, sd] = Plan_startDate.split("-").map((n) => parseInt(n, 10));
      const [ey, em, ed] = Plan_endDate.split("-").map((n) => parseInt(n, 10));
      const startObj = new Date(sy, sm - 1, sd);
      const endObj = new Date(ey, em - 1, ed);

      if (startObj > endObj) {
        return res.status(400).json({
          error: "Plan_startDate must be before or equal to Plan_endDate",
        });
      }

      // Ensure referenced application exists
      const [appRows] = await pool.query(
        `SELECT 1
           FROM applications
          WHERE App_Acronym = ?
          LIMIT 1`,
        [Plan_app_acronym.trim()]
      );
      if (appRows.length === 0) {
        return res.status(400).json({
          error: "Referenced application does not exist",
        });
      }

      // Insert plan
      const insertSql = `
        INSERT INTO plans
          (Plan_MVP_name,
           Plan_startDate,
           Plan_endDate,
           Plan_app_acronym)
        VALUES (?, ?, ?, ?)
      `;

      const params = [
        Plan_MVP_name.trim(),
        Plan_startDate,
        Plan_endDate,
        Plan_app_acronym.trim(),
      ];

      await pool.query(insertSql, params);

      // Read back the inserted row
      const [rows] = await pool.query(
        `SELECT Plan_MVP_name,
                Plan_startDate,
                Plan_endDate,
                Plan_app_acronym
           FROM plans
          WHERE Plan_MVP_name = ?`,
        [Plan_MVP_name.trim()]
      );

      if (!rows.length) {
        return res
          .status(500)
          .json({ error: "Failed to read created plan" });
      }

      const record = normalizeRow(rows[0]);
      // return just the created plan object
      return res.status(201).json(record);
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "Plan already exists" });
      }
      console.error("POST /api/plans error:", err);
      return res.status(500).json({ error: "Failed to create plan" });
    }
  }
);

module.exports = router;
