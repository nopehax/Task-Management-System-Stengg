const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const { authRequired, requireGroup } = require("../middleware/auth");

/* Utilities */

function ensureArrayOfStrings(v) {
  if (!Array.isArray(v)) return false;
  return v.every((x) => typeof x === "string" && x.trim().length > 0);
}

// simple shape normalizer for rows returned from MySQL
function normalizeRow(row) {
  // Dates: return exactly what MySQL gave us (DATE comes back as 'YYYY-MM-DD')
  const out = {
    App_Acronym: row.App_Acronym,
    App_Description: row.App_Description,
    App_Rnumber: Number(row.App_Rnumber ?? 0),
    App_startDate: row.App_startDate || "",
    App_endDate: row.App_endDate || "",
    App_permit_Create: [],
    App_permit_Open: [],
    App_permit_ToDo: [],
    App_permit_Doing: [],
    App_permit_Done: [],
  };

  // Parse JSON arrays for permit fields
  const jsonFields = [
    "App_permit_Create",
    "App_permit_Open",
    "App_permit_ToDo",
    "App_permit_Doing",
    "App_permit_Done",
  ];
  for (const f of jsonFields) {
    const raw = row[f];
    if (Array.isArray(raw)) {
      out[f] = raw;
    } else if (raw == null || raw === "") {
      out[f] = [];
    } else {
      try {
        out[f] = JSON.parse(raw);
      } catch {
        out[f] = [];
      }
    }
  }

  return out;
}

// validate yyyy-MM-dd
function isIsoDateString(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/* GET /api/applications
   Any authenticated user. Read-only list. Sorted by acronym A→Z. */
router.get("/applications", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT App_Acronym, App_Description, App_Rnumber,
              App_startDate, App_endDate,
              App_permit_Create, App_permit_Open, App_permit_ToDo, App_permit_Doing, App_permit_Done
         FROM applications
         ORDER BY App_Acronym ASC`
    );

    const data = rows.map(normalizeRow);
    res.json(data);
  } catch (err) {
    console.error("GET /api/applications error:", err);
    res.status(500).json({ error: "Failed to load applications" });
  }
});

/* POST /api/applications
   Only users in 'project lead'. All fields mandatory; Rnumber starts at 0.
   Dates are accepted as-is from the frontend (yyyy-MM-dd) and written directly to MySQL. */
router.post(
  "/applications",
  authRequired,
  requireGroup(["project lead"]),
  async (req, res) => {
    try {
      const {
        App_Acronym,
        App_Description,
        App_startDate,
        App_endDate,
        App_permit_Create,
        App_permit_Open,
        App_permit_ToDo,
        App_permit_Doing,
        App_permit_Done,
      } = req.body || {};

      // Acronym validation
      if (
        !App_Acronym ||
        typeof App_Acronym !== "string" ||
        App_Acronym.length > 50
      ) {
        return res
          .status(400)
          .json({ error: "Invalid Acronym (max 50 chars)" });
      }

      // Description validation
      if (
        !App_Description ||
        typeof App_Description !== "string" ||
        !App_Description.trim()
      ) {
        return res.status(400).json({ error: "Description is required" });
      }

      // Date validation (yyyy-MM-dd, start <= end)
      if (!isIsoDateString(App_startDate) || !isIsoDateString(App_endDate)) {
        return res
          .status(400)
          .json({ error: "Dates must be in yyyy-MM-dd format" });
      }

      // compare as actual dates
      const [sy, sm, sd] = App_startDate.split("-").map((n) => parseInt(n, 10));
      const [ey, em, ed] = App_endDate.split("-").map((n) => parseInt(n, 10));
      const startObj = new Date(sy, sm - 1, sd);
      const endObj = new Date(ey, em - 1, ed);

      if (startObj > endObj) {
        return res.status(400).json({
          error: "Start Date must be before or equal to End Date",
        });
      }

      // Permit validation:
      // each must be an array of >=1 valid group strings
      const groupsOk =
        ensureArrayOfStrings(App_permit_Create) &&
        ensureArrayOfStrings(App_permit_Open) &&
        ensureArrayOfStrings(App_permit_ToDo) &&
        ensureArrayOfStrings(App_permit_Doing) &&
        ensureArrayOfStrings(App_permit_Done) &&
        App_permit_Create.length > 0 &&
        App_permit_Open.length > 0 &&
        App_permit_ToDo.length > 0 &&
        App_permit_Doing.length > 0 &&
        App_permit_Done.length > 0;

      if (!groupsOk) {
        return res.status(400).json({
          error:
            "All permit fields must be arrays of at least one valid group name",
        });
      }

      // Insert; Rnumber starts at 0
      const insertSql = `
        INSERT INTO applications
         (App_Acronym, App_Description, App_Rnumber,
          App_startDate, App_endDate,
          App_permit_Create, App_permit_Open, App_permit_ToDo, App_permit_Doing, App_permit_Done)
        VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        App_Acronym.trim(),
        App_Description.trim(),
        App_startDate,
        App_endDate,
        JSON.stringify(App_permit_Create),
        JSON.stringify(App_permit_Open),
        JSON.stringify(App_permit_ToDo),
        JSON.stringify(App_permit_Doing),
        JSON.stringify(App_permit_Done),
      ];

      await pool.query(insertSql, params);

      // Read back created row (canonical shape)
      const [rows] = await pool.query(
        `SELECT App_Acronym, App_Description, App_Rnumber,
                App_startDate, App_endDate,
                App_permit_Create, App_permit_Open, App_permit_ToDo, App_permit_Doing, App_permit_Done
           FROM applications
          WHERE App_Acronym = ?`,
        [App_Acronym.trim()]
      );

      if (!rows.length) {
        return res
          .status(500)
          .json({ error: "Failed to read created record" });
      }

      const record = normalizeRow(rows[0]);
      return res.status(201).json(record);
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "Acronym already exists" });
      }
      console.error("POST /api/applications error:", err);
      return res.status(500).json({ error: "Failed to create application" });
    }
  }
);

module.exports = router;
