// src/components/ChipsMultiSelect.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";

/** normalize to snake_case, max 50 chars, allow a-z 0-9 _ . - */
export function normalizeGroupName(name) {
  if (typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .slice(0, 50);
}

export default function ChipsMultiSelect({
  options = [],          // array of strings (snake_case)
  value = [],            // array of strings (snake_case)
  onChange,              // (arr) => void
  placeholder = "Select groups…",
  disabled = false,
  errorText = "",
  maxMenuHeight = 240,   // desired max list height (will clamp to viewport)
  id = "chips-multiselect"
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);    // wraps the trigger
  const buttonRef = useRef(null);  // trigger button
  const menuRef = useRef(null);    // portal menu root

  // Computed menu geometry
  const [menuGeom, setMenuGeom] = useState({
    top: 0,
    left: 0,
    width: 0,
    listMaxHeight: maxMenuHeight,
  });

  const normalizedOptions = useMemo(
    () => Array.from(new Set(options.map(normalizeGroupName))).sort(),
    [options]
  );
  const normalizedValue = useMemo(
    () => Array.from(new Set((value || []).map(normalizeGroupName))),
    [value]
  );

  // Close on outside click (acknowledging the portal menu)
  useEffect(() => {
    function onDocMouseDown(e) {
      const t = e.target;
      const insideTrigger = !!(rootRef.current && rootRef.current.contains(t));
      const insideMenu = !!(menuRef.current && menuRef.current.contains(t));
      if (!insideTrigger && !insideMenu) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Position/reposition the portal menu within viewport
  useEffect(() => {
    function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }

    function updatePos() {
      if (!buttonRef.current) return;

      const margin = 8; // gap and viewport padding
      const chromeHeight = 0; // no search/actions now
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const rect = buttonRef.current.getBoundingClientRect();

      // Width: match trigger but clamp to viewport with padding
      const width = clamp(rect.width, 200, vw - margin * 2);

      // Decide placement (below vs above) based on available space
      const spaceBelow = vh - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const desiredTotal = chromeHeight + maxMenuHeight;
      const placeBelow = spaceBelow >= Math.min(desiredTotal, spaceAbove);

      // Compute list max height that fits on chosen side
      const fitSpace = placeBelow ? spaceBelow : spaceAbove;
      const listMaxHeight = clamp(fitSpace - chromeHeight, 120, maxMenuHeight);

      // Final top (fixed) — place below or above; clamp inside viewport
      let top = placeBelow
        ? rect.bottom + margin
        : rect.top - margin - (chromeHeight + listMaxHeight);
      top = clamp(top, margin, vh - margin - (chromeHeight + listMaxHeight));

      // Final left — clamp to viewport
      const left = clamp(rect.left, margin, vw - margin - width);

      setMenuGeom({ top, left, width, listMaxHeight });
    }

    if (open) {
      updatePos();
      window.addEventListener("resize", updatePos);
      window.addEventListener("scroll", updatePos, true);
      return () => {
        window.removeEventListener("resize", updatePos);
        window.removeEventListener("scroll", updatePos, true);
      };
    }
  }, [open, maxMenuHeight]);

  function toggleOption(opt) {
    if (disabled) return;
    const nv = normalizeGroupName(opt);
    let out;
    if (normalizedValue.includes(nv)) {
      out = normalizedValue.filter((g) => g !== nv);
    } else {
      out = [...normalizedValue, nv];
    }
    onChange?.(out);
  }

  const menu = open && !disabled ? (
    <div
      ref={menuRef}
      role="listbox"
      tabIndex={-1}
      style={{
        position: "fixed",
        zIndex: 1000,
        top: menuGeom.top,
        left: menuGeom.left,
        width: menuGeom.width,
        border: "1px solid #ddd",
        borderRadius: 8,
        background: "#fff",
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
      }}
    >
      {/* Options only */}
      <div style={{ maxHeight: menuGeom.listMaxHeight, overflow: "auto" }}>
        {normalizedOptions.length === 0 && (
          <div style={{ padding: 12, color: "#777" }}>No groups</div>
        )}
        {normalizedOptions.map((opt) => {
          const selected = normalizedValue.includes(opt);
          return (
            <div
              key={opt}
              role="option"
              aria-selected={selected}
              onClick={() => toggleOption(opt)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggleOption(opt);
              }}
              tabIndex={0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                cursor: "pointer",
                background: selected ? "#f0f7ff" : "transparent",
              }}
            >
              <input type="checkbox" checked={selected} readOnly />
              <span>{opt}</span>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      style={{ width: "100%", position: "relative" }}
      aria-haspopup="listbox"
      aria-expanded={open}
    >
      {/* Field */}
      <button
        id={id}
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{
          width: "100%",
          minHeight: 40,
          border: `1px solid ${errorText ? "#d93025" : "#ccc"}`,
          borderRadius: 8,
          background: disabled ? "#f7f7f7" : "#fff",
          padding: 8,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {normalizedValue.length === 0 ? (
          <span style={{ color: "#888" }}>{placeholder}</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {normalizedValue.map((g) => (
              <span
                key={g}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOption(g);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: "#f5f5f5",
                  fontSize: 13,
                }}
              >
                {g}
                <span aria-label={`Remove ${g}`} style={{ fontWeight: 700 }}>
                  ×
                </span>
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Error */}
      {errorText ? (
        <div style={{ color: "#d93025", fontSize: 12, marginTop: 6 }}>
          {errorText}
        </div>
      ) : null}

      {/* Portal menu to avoid clipping */}
      {menu ? ReactDOM.createPortal(menu, document.body) : null}
    </div>
  );
}
