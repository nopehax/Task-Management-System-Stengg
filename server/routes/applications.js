const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const { authRequired, requireGroup } = require("../middleware/auth");

/* Utilities */

function ensureArrayOfStrings(v) {
  if (!Array.isArray(v)) return false;
  if (v.length === 0) return true;
  return v.every((x) => typeof x === "string" && x.trim().length > 0);
}

// simple shape normalizer for rows returned from MySQL
function normalizeRow(row) {
  // Dates: return exactly what MySQL gave us (DATE comes back as 'YYYY-MM-DD')
  const out = {
    App_Acronym: row.App_Acronym,
    App_Description: row.App_Description,
    App_Rnumber: row.App_Rnumber,
    App_startDate: row.App_startDate || '',
    App_endDate: row.App_endDate || '',
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

/* GET /api/applications */
router.get("/applications", authRequired, async (_req, res) => {
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
router.post("/applications", authRequired, requireGroup(["project lead"]), async (req, res) => {
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
        return res.status(400).json({ error: "Invalid Acronym) max 50 chars)" });
      }

      // Description validation
      if (typeof App_Description !== "string" || (App_Description.trim().length > 255)) {
        return res.status(400).json({ error: "Invalid Description (max 255 chars)" });
      }

      // Date validation (yyyy-MM-dd, start <= end)
      if (App_startDate && App_endDate) {
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
      }

      // Permit validation:
      const groupsOk =
        ensureArrayOfStrings(App_permit_Create) &&
        ensureArrayOfStrings(App_permit_Open) &&
        ensureArrayOfStrings(App_permit_ToDo) &&
        ensureArrayOfStrings(App_permit_Doing) &&
        ensureArrayOfStrings(App_permit_Done);

      if (!groupsOk) {
        return res.status(400).json({
          error:
            "All permit fields must be arrays",
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
        App_startDate || null,
        App_endDate || null,
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

/* PATCH /api/applications/:acronym
   Only 'project lead' can edit.
   Everything is editable EXCEPT:
   - App_Acronym
   - App_Rnumber
*/
router.patch("/applications/:acronym", authRequired, requireGroup(["project lead"]), async (req, res) => {
    const { acronym } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // first check record exists
      const [rows] = await conn.query(
        `SELECT App_Acronym FROM applications WHERE App_Acronym = ?`,
        [acronym]
      );
      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({ error: "Application not found" });
      }

      const {
        App_Description,
        App_startDate,
        App_endDate,
        App_permit_Create,
        App_permit_Open,
        App_permit_ToDo,
        App_permit_Doing,
        App_permit_Done,
      } = req.body || {};

      // fields can be empty on update (your current rule)
      if (typeof App_Description !== "string" || App_Description.trim().length > 255) {
        await conn.rollback();
        return res
          .status(400)
          .json({ error: "Invalid Description (max 255 chars)" });
      }

      if (App_startDate && App_endDate) {
        const [sy, sm, sd] = App_startDate.split("-").map((n) => parseInt(n, 10));
        const [ey, em, ed] = App_endDate.split("-").map((n) => parseInt(n, 10));
        const startObj = new Date(sy, sm - 1, sd);
        const endObj = new Date(ey, em - 1, ed);

        if (startObj > endObj) {
          await conn.rollback();
          return res.status(400).json({
            error: "Start Date must be before or equal to End Date",
          });
        }
      }

      const groupsOk =
        ensureArrayOfStrings(App_permit_Create) &&
        ensureArrayOfStrings(App_permit_Open) &&
        ensureArrayOfStrings(App_permit_ToDo) &&
        ensureArrayOfStrings(App_permit_Doing) &&
        ensureArrayOfStrings(App_permit_Done);

      if (!groupsOk) {
        await conn.rollback();
        return res.status(400).json({
          error: "All permit fields must be arrays",
        });
      }

      // update
      await conn.query(
        `
        UPDATE applications
           SET App_Description = ?,
               App_startDate = ?,
               App_endDate = ?,
               App_permit_Create = ?,
               App_permit_Open = ?,
               App_permit_ToDo = ?,
               App_permit_Doing = ?,
               App_permit_Done = ?
         WHERE App_Acronym = ?
        `,
        [
          App_Description.trim(),
          App_startDate || null,
          App_endDate || null,
          JSON.stringify(App_permit_Create),
          JSON.stringify(App_permit_Open),
          JSON.stringify(App_permit_ToDo),
          JSON.stringify(App_permit_Doing),
          JSON.stringify(App_permit_Done),
          acronym,
        ]
      );

      // read it back
      const [rows2] = await conn.query(
        `SELECT App_Acronym, App_Description, App_Rnumber,
                App_startDate, App_endDate,
                App_permit_Create, App_permit_Open, App_permit_ToDo, App_permit_Doing, App_permit_Done
           FROM applications
          WHERE App_Acronym = ?`,
        [acronym]
      );

      if (!rows2.length) {
        await conn.rollback();
        return res
          .status(500)
          .json({ error: "Failed to read updated record" });
      }

      await conn.commit();

      const record = normalizeRow(rows2[0]);
      return res.json(record);
    } catch (err) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (e) {
          // ignore rollback error
        }
      }
      console.error("PATCH /api/applications/:acronym error:", err);
      return res.status(500).json({ error: "Failed to update application" });
    } finally {
      if (conn) conn.release();
    }
  }
);


module.exports = router;
