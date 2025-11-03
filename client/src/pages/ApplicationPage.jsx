// src/pages/ApplicationPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "../utils/authContext";
import HeaderPage from "../components/Header";
import ChipsMultiSelect from "../components/ChipsMultiSelect";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
  headers: { Accept: "application/json" },
});

const Chips = ({ items }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((g) => (
        <span
          key={g}
          className="inline-block text-xs px-2 py-1 rounded-full border bg-gray-50"
        >
          {g}
        </span>
      ))}
    </div>
  );
};

// shallow compare for the fields we care about
function appEqualsCurrentToOrig(curr) {
  const o = curr.__orig;
  if (!o) return false;
  if ((curr.App_Description || "") !== (o.App_Description || "")) return false;
  if ((curr.App_startDate || "") !== (o.App_startDate || "")) return false;
  if ((curr.App_endDate || "") !== (o.App_endDate || "")) return false;

  const pairs = [
    ["App_permit_Create", curr.App_permit_Create, o.App_permit_Create],
    ["App_permit_Open", curr.App_permit_Open, o.App_permit_Open],
    ["App_permit_ToDo", curr.App_permit_ToDo, o.App_permit_ToDo],
    ["App_permit_Doing", curr.App_permit_Doing, o.App_permit_Doing],
    ["App_permit_Done", curr.App_permit_Done, o.App_permit_Done],
  ];

  for (const [, a, b] of pairs) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (aa[i] !== bb[i]) return false;
    }
  }

  return true;
}

const ApplicationPage = () => {
  const { ready, isAuthenticated, hasAnyGroup } = useAuth();
  const isProjectLead = hasAnyGroup && hasAnyGroup("project lead");

  const [apps, setApps] = useState([]);
  const [groups, setGroups] = useState([]);

  const [postError, setPostError] = useState("");
  const [rowErrors, setRowErrors] = useState({});

  // create-row state
  const [acronym, setAcronym] = useState("");
  const [desc, setDesc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [permitCreate, setPermitCreate] = useState([]);
  const [permitOpen, setPermitOpen] = useState([]);
  const [permitToDo, setPermitToDo] = useState([]);
  const [permitDoing, setPermitDoing] = useState([]);
  const [permitDone, setPermitDone] = useState([]);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    let mounted = true;
    (async () => {
      try {
        const [appsRes, groupsRes] = await Promise.all([
          api.get("/applications"),
          api.get("/usergroups"),
        ]);
        if (!mounted) return;
        const list = Array.isArray(appsRes.data) ? appsRes.data : [];
        // normalize dates + attach __orig
        const norm = list.map((a) => {
          const normalized = {
            ...a,
            App_startDate: a.App_startDate.split("T")[0] || "",
            App_endDate: a.App_endDate.split("T")[0] || "",
          };
          return {
            ...normalized,
            __orig: { ...normalized },
            __dirty: false,
          };
        });
        setApps(norm);

        const g = Array.isArray(groupsRes.data) ? groupsRes.data : [];
        setGroups(g);
      } catch (_err) {
        setApps([]);
        setGroups([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [ready, isAuthenticated]);

  const sortedApps = useMemo(() => {
    return [...apps].sort((a, b) =>
      (a.App_Acronym).localeCompare(b.App_Acronym)
    );
  }, [apps]);

  // POST create
  async function handleCreate() {
    setPostError("");

    if (!acronym || acronym.length > 50) {
      setPostError("Invalid Acronym (max 50 chars).");
      return;
    }
    if (!desc.trim() && desc.trim().length > 255) {
      setPostError("Invalid Description (max 255 chars).");
      return;
    }
    // compare dates
    const [sy, sm, sd] = startDate.split("-").map((x) => parseInt(x, 10));
    const [ey, em, ed] = endDate.split("-").map((x) => parseInt(x, 10));
    const sdObj = new Date(sy, sm - 1, sd);
    const edObj = new Date(ey, em - 1, ed);

    if (sdObj > edObj) {
      setPostError("Start Date must be before or equal to End Date.");
      return;
    }

    try {
      const body = {
        App_Acronym: acronym,
        App_Description: desc,
        App_startDate: startDate,
        App_endDate: endDate,
        App_permit_Create: permitCreate,
        App_permit_Open: permitOpen,
        App_permit_ToDo: permitToDo,
        App_permit_Doing: permitDoing,
        App_permit_Done: permitDone,
      };

      const res = await api.post("/applications", body);
      const created = res.data;
      if (created) {
        const normalized = {
          ...created,
          App_startDate: created.App_startDate.split("T")[0] || "",
          App_endDate: created.App_endDate.split("T")[0] || "",
        };
        const withOrig = {
          ...normalized,
          __orig: { ...normalized },
          __dirty: false,
        };
        setApps((prev) => [withOrig, ...prev]);

        setAcronym("");
        setDesc("");
        setStartDate("");
        setEndDate("");
        setPermitCreate([]);
        setPermitOpen([]);
        setPermitToDo([]);
        setPermitDoing([]);
        setPermitDone([]);
        setPostError("");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        "Failed to create application. Please try again.";
      setPostError(msg);
    }
  }

  // update a row field and recompute dirty based on __orig
  function updateRow(acronym, patch) {
    setApps((prev) =>
      prev.map((a) => {
        if (a.App_Acronym !== acronym) return a;
        const next = {
          ...a,
          ...patch,
        };
        const isSame = appEqualsCurrentToOrig(next);
        return {
          ...next,
          __dirty: !isSame,
        };
      })
    );
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[acronym];
      return next;
    });
  }

  async function handleSaveRow(row) {
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
    } = row;

    if (!App_Description.trim() && App_Description.trim().length > 255) {
      setRowErrors((prev) => ({
        ...prev,
        [App_Acronym]: "Invalid Description (max 255 chars).",
      }));
      return;
    }

    if (App_startDate && App_endDate) {
      const [sy, sm, sd] = App_startDate.split("-").map((x) => parseInt(x, 10));
      const [ey, em, ed] = App_endDate.split("-").map((x) => parseInt(x, 10));
      const sdObj = new Date(sy, sm - 1, sd);
      const edObj = new Date(ey, em - 1, ed);
      if (sdObj > edObj) {
        setRowErrors((prev) => ({
          ...prev,
          [App_Acronym]: "Start Date must be before or equal to End Date.",
        }));
        return;
      }
    }

    const allOk =
      Array.isArray(App_permit_Create) &&
      Array.isArray(App_permit_Open) &&
      Array.isArray(App_permit_ToDo) &&
      Array.isArray(App_permit_Doing) &&
      Array.isArray(App_permit_Done);

    if (!allOk) {
      setRowErrors((prev) => ({
        ...prev,
        [App_Acronym]: "Invalid permit fields",
      }));
      return;
    }

    try {
      const res = await api.patch(`/applications/${App_Acronym}`, {
        App_Description,
        App_startDate,
        App_endDate,
        App_permit_Create,
        App_permit_Open,
        App_permit_ToDo,
        App_permit_Doing,
        App_permit_Done,
      });
      const updated = res.data;
      if (updated) {
        const normalized = {
          ...updated,
          App_startDate: (updated.App_startDate || "").split("T")[0] || "",
          App_endDate: (updated.App_endDate || "").split("T")[0] || "",
        };
        setApps((prev) =>
          prev.map((a) => {
            if (a.App_Acronym !== normalized.App_Acronym) return a;
            // reset __orig to the saved version
            return {
              ...normalized,
              __orig: { ...normalized },
              __dirty: false,
            };
          })
        );
        setRowErrors((prev) => {
          const next = { ...prev };
          delete next[App_Acronym];
          return next;
        });
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error || "Failed to update application.";
      setRowErrors((prev) => ({
        ...prev,
        [App_Acronym]: msg,
      }));
    }
  }

  if (!ready) return null;
  if (!isAuthenticated) return null;

  return (
    <>
      <HeaderPage />
      <div className="p-6 mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Applications</h1>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-left text-gray-600">
                <th className="px-3 py-3">ACRONYM</th>
                <th className="px-3 py-3">DESCRIPTION</th>
                <th className="px-3 py-3">START DATE</th>
                <th className="px-3 py-3">END DATE</th>
                <th className="px-3 py-3">CREATE</th>
                <th className="px-3 py-3">OPEN</th>
                <th className="px-3 py-3">TO DO</th>
                <th className="px-3 py-3">DOING</th>
                <th className="px-3 py-3">DONE</th>
                <th className="px-3 py-3">TASKS</th>
                {isProjectLead && <th className="px-3 py-3 w-[56px]"></th>}
              </tr>
            </thead>
            <tbody>
              {/* CREATE ROW (only project lead) */}
              {isProjectLead && (
                <>
                  <tr className="bg-blue-50/50">
                    {/* ACRONYM */}
                    <td className="px-3 py-2 align-top">
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={acronym}
                        onChange={(e) => setAcronym(e.target.value)}
                        placeholder="APP1"
                      />
                    </td>
                    {/* DESCRIPTION */}
                    <td className="px-3 py-2 align-top">
                      <textarea
                        className="w-full border rounded px-2 py-1"
                        rows={2}
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder="desc"
                      />
                    </td>
                    {/* START DATE */}
                    <td className="px-3 py-2 align-top">
                      <input
                        type="date"
                        className="w-full border rounded px-2 py-1"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </td>
                    {/* END DATE */}
                    <td className="px-3 py-2 align-top">
                      <input
                        type="date"
                        className="w-full border rounded px-2 py-1"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </td>
                    {/* CREATE PERMIT */}
                    <td className="px-3 py-2 align-top">
                      <ChipsMultiSelect
                        options={groups}
                        value={permitCreate}
                        onChange={setPermitCreate}
                        placeholder="Select groups…"
                      />
                    </td>
                    {/* OPEN PERMIT */}
                    <td className="px-3 py-2 align-top">
                      <ChipsMultiSelect
                        options={groups}
                        value={permitOpen}
                        onChange={setPermitOpen}
                        placeholder="Select groups…"
                      />
                    </td>
                    {/* TO DO PERMIT */}
                    <td className="px-3 py-2 align-top">
                      <ChipsMultiSelect
                        options={groups}
                        value={permitToDo}
                        onChange={setPermitToDo}
                        placeholder="Select groups…"
                      />
                    </td>
                    {/* DOING PERMIT */}
                    <td className="px-3 py-2 align-top">
                      <ChipsMultiSelect
                        options={groups}
                        value={permitDoing}
                        onChange={setPermitDoing}
                        placeholder="Select groups…"
                      />
                    </td>
                    {/* DONE PERMIT */}
                    <td className="px-3 py-2 align-top">
                      <ChipsMultiSelect
                        options={groups}
                        value={permitDone}
                        onChange={setPermitDone}
                        placeholder="Select groups…"
                      />
                    </td>
                    {/* TASKS (read-only = 0 on create) */}
                    <td className="px-3 py-2 align-top flex justify-center text-gray-500">0</td>
                    <td className="px-3 py-2 align-top">
                      <button
                        className="h-8 w-8 rounded flex items-center justify-center item bg-blue-600 text-white text-2xl leading-none pb-1"
                        title="Create Application"
                        onClick={handleCreate}
                      >
                        +
                      </button>
                    </td>
                  </tr>
                  {/* Inline error below the create row */}
                  {postError ? (
                    <tr>
                      <td colSpan={11} className="px-3 pb-3">
                        <div className="mt-1 text-sm text-red-600">
                          {postError}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              )}

              {/* DATA ROWS */}
              {sortedApps.map((a) => {
                const rowErr = rowErrors[a.App_Acronym];
                const isDirty = !!a.__dirty;
                return (
                  <React.Fragment key={a.App_Acronym}>
                    <tr className="border-t last:border-b">
                      {/* ACRONYM (read-only) */}
                      <td className="px-3 py-3 align-top font-semibold text-gray-800">
                        {a.App_Acronym}
                      </td>
                      {/* DESCRIPTION (editable) */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <textarea
                            className="w-full border rounded px-2 py-1"
                            rows={2}
                            value={a.App_Description || ""}
                            onChange={(e) =>
                              updateRow(a.App_Acronym, {
                                App_Description: e.target.value,
                              })
                            }
                          />
                        ) : (
                          <textarea
                            readOnly
                            className="w-full border rounded px-2 py-1 bg-gray-50"
                            rows={2}
                            value={a.App_Description || ""}
                          />
                        )}
                      </td>
                      {/* START DATE (editable for project lead) */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <input
                            type="date"
                            className="w-full border rounded px-2 py-1"
                            value={a.App_startDate || ""}
                            onChange={(e) =>
                              updateRow(a.App_Acronym, {
                                App_startDate: e.target.value,
                              })
                            }
                          />
                        ) : (
                          <div>{a.App_startDate || ""}</div>
                        )}
                      </td>
                      {/* END DATE */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <input
                            type="date"
                            className="w-full border rounded px-2 py-1"
                            value={a.App_endDate || ""}
                            onChange={(e) =>
                              updateRow(a.App_Acronym, {
                                App_endDate: e.target.value,
                              })
                            }
                          />
                        ) : (
                          <div>{a.App_endDate || ""}</div>
                        )}
                      </td>
                      {/* CREATE PERMIT */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <ChipsMultiSelect
                            options={groups}
                            value={a.App_permit_Create || []}
                            onChange={(val) =>
                              updateRow(a.App_Acronym, {
                                App_permit_Create: val,
                              })
                            }
                            placeholder="Select groups…"
                          />
                        ) : (
                          <Chips items={a.App_permit_Create} />
                        )}
                      </td>
                      {/* OPEN PERMIT */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <ChipsMultiSelect
                            options={groups}
                            value={a.App_permit_Open || []}
                            onChange={(val) =>
                              updateRow(a.App_Acronym, {
                                App_permit_Open: val,
                              })
                            }
                            placeholder="Select groups…"
                          />
                        ) : (
                          <Chips items={a.App_permit_Open} />
                        )}
                      </td>
                      {/* TO DO PERMIT */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <ChipsMultiSelect
                            options={groups}
                            value={a.App_permit_ToDo || []}
                            onChange={(val) =>
                              updateRow(a.App_Acronym, {
                                App_permit_ToDo: val,
                              })
                            }
                            placeholder="Select groups…"
                          />
                        ) : (
                          <Chips items={a.App_permit_ToDo} />
                        )}
                      </td>
                      {/* DOING PERMIT */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <ChipsMultiSelect
                            options={groups}
                            value={a.App_permit_Doing || []}
                            onChange={(val) =>
                              updateRow(a.App_Acronym, {
                                App_permit_Doing: val,
                              })
                            }
                            placeholder="Select groups…"
                          />
                        ) : (
                          <Chips items={a.App_permit_Doing} />
                        )}
                      </td>
                      {/* DONE PERMIT */}
                      <td className="px-3 py-3 align-top">
                        {isProjectLead ? (
                          <ChipsMultiSelect
                            options={groups}
                            value={a.App_permit_Done || []}
                            onChange={(val) =>
                              updateRow(a.App_Acronym, {
                                App_permit_Done: val,
                              })
                            }
                            placeholder="Select groups…"
                          />
                        ) : (
                          <Chips items={a.App_permit_Done} />
                        )}
                      </td>
                      {/* TASKS (read-only) */}
                      <td className="px-3 py-3 align-top flex justify-center">
                        {a.App_Rnumber ?? 0}
                      </td>
                      {/* ACTION: Save (project lead only) */}
                      {isProjectLead ? (
                        <td className="px-3 py-3 align-top">
                          <button
                            className={`h-8 w-8 flex items-center justify-center rounded ${isDirty
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-gray-200 text-gray-500 cursor-not-allowed"
                              }`}
                            onClick={() => isDirty && handleSaveRow(a)}
                            disabled={!isDirty}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-5 h-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.25"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                              <polyline points="17 21 17 13 7 13 7 21" />
                              <polyline points="7 3 7 8 15 8" />
                            </svg>
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {/* Per-row error */}
                    {rowErr ? (
                      <tr>
                        <td
                          colSpan={isProjectLead ? 11 : 10}
                          className="px-3 pb-3"
                        >
                          <div className="text-sm text-red-600">{rowErr}</div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}

              {sortedApps.length === 0 && !isProjectLead && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-gray-500">
                    No applications found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default ApplicationPage;
