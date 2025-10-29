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

// Utilities
const isIsoDateString = (s) => {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const cmpAcronym = (a, b) => {
  return a.App_Acronym.localeCompare(b.App_Acronym);
}

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
}

const ApplicationPage = () => {
  const { ready, isAuthenticated, hasAnyGroup } = useAuth();
  const isProjectLead = hasAnyGroup && hasAnyGroup("project lead");

  const [apps, setApps] = useState([]);
  const [groups, setGroups] = useState([]);

  // Create-row state (visible only to project lead)
  const [acronym, setAcronym] = useState("");
  const [desc, setDesc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [permitCreate, setPermitCreate] = useState([]);
  const [permitOpen, setPermitOpen] = useState([]);
  const [permitToDo, setPermitToDo] = useState([]);
  const [permitDoing, setPermitDoing] = useState([]);
  const [permitDone, setPermitDone] = useState([]);
  const [postError, setPostError] = useState("");

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
        console.log(appsRes);
        console.log(groupsRes)
        const list = Array.isArray(appsRes.data)
          ? appsRes.data
          : [];
        console.log(list)
        const norm = list.map(a => ({
          ...a,
          App_startDate: a.App_startDate.split("T")[0],
          App_endDate: a.App_endDate.split("T")[0],
        }));
        setApps(norm);

        const g = Array.isArray(groupsRes.data)
          ? groupsRes.data
          : [];
        setGroups(g);
      } catch (_err) {
        // show empty table on load errors
        setApps([]);
        setGroups([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [ready, isAuthenticated]);

  const sortedApps = useMemo(() => {
    return [...apps].sort(cmpAcronym);
  }, [apps]);

  // Validate and POST create
  async function handleCreate(e) {
    e.preventDefault();
    setPostError("");

    // Client-side validation
    if (!acronym || acronym.length > 50) {
      setPostError("Acronym is required (max 50 chars).");
      return;
    }
    if (!desc.trim()) {
      setPostError("Description is required.");
      return;
    }
    if (!isIsoDateString(startDate) || !isIsoDateString(endDate)) {
      setPostError("Dates must be in yyyy-MM-dd format.");
      return;
    }

    // compare dates
    // parse yyyy-MM-dd -> Date objects
    const [sy, sm, sd] = startDate.split("-").map((x) => parseInt(x, 10));
    const [ey, em, ed] = endDate.split("-").map((x) => parseInt(x, 10));
    const sdObj = new Date(sy, sm - 1, sd);
    const edObj = new Date(ey, em - 1, ed);

    if (sdObj > edObj) {
      setPostError("Start Date must be before or equal to End Date.");
      return;
    }

    const allOk =
      permitCreate.length &&
      permitOpen.length &&
      permitToDo.length &&
      permitDoing.length &&
      permitDone.length;
    if (!allOk) {
      setPostError("All permit fields require at least one group.");
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
        const norm = {
          ...created,
          App_startDate: created.App_startDate.split("T")[0],
          App_endDate: created.App_endDate.split("T")[0],
        };
        setApps((prev) => [norm, ...prev]);
        // clear inputs
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
              {isProjectLead && (
                <>
                  <tr className="bg-blue-100 align-top">
                    {/* ACRONYM */}
                    <td className="px-3 py-2 align-top">
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={acronym}
                        onChange={(e) => setAcronym(e.target.value)}
                      />
                    </td>

                    {/* DESCRIPTION */}
                    <td className="px-3 py-2 align-top">
                      <textarea
                        className="w-full border rounded px-2 py-1"
                        rows={2}
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                      />
                    </td>

                    {/* START DATE (calendar, yyyy-MM-dd) */}
                    <td className="px-3 py-2 align-top">
                      <input
                        type="date"
                        className="w-full border rounded px-2 py-1"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value); // yyyy-MM-dd
                        }}
                      />
                    </td>

                    {/* END DATE (calendar, yyyy-MM-dd) */}
                    <td className="px-3 py-2 align-top">
                      <input
                        type="date"
                        className="w-full border rounded px-2 py-1"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value); // yyyy-MM-dd
                        }}
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
                    <td className="px-3 py-2 align-top text-gray-500">0</td>

                    {/* Create button */}
                    <td className="px-3 py-2 align-top">
                      <button
                        className="h-8 w-8 rounded-full bg-blue-600 text-white text-lg leading-8"
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
                      <td colSpan={isProjectLead ? 11 : 10} className="px-3 pb-3">
                        <div className="mt-1 text-sm text-red-600">
                          {postError}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              )}

              {/* Data rows (read-only) */}
              {sortedApps.map((a) => (
                <tr key={a.App_Acronym} className="border-t align-top">
                  <td className="px-3 py-3 align-top">{a.App_Acronym}</td>
                  <td className="px-3 py-3 align-top">
                    <textarea
                      readOnly
                      className="w-full border rounded px-2 py-1 bg-gray-50"
                      rows={2}
                      value={a.App_Description || ""}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    {a.App_startDate || ""}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {a.App_endDate || ""}
                  </td>

                  <td className="px-3 py-3 align-top">
                    <Chips items={a.App_permit_Create} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Chips items={a.App_permit_Open} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Chips items={a.App_permit_ToDo} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Chips items={a.App_permit_Doing} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Chips items={a.App_permit_Done} />
                  </td>

                  <td className="px-3 py-3 align-top">{a.App_Rnumber ?? 0}</td>
                  {isProjectLead && <td className="px-3 py-3 align-top"></td>}
                </tr>
              ))}

              {sortedApps.length === 0 && !isProjectLead && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-gray-500">
                    {/* empty table state */}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default ApplicationPage;
