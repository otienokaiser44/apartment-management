"use client";

import { useState, type ReactNode } from "react";

type Mode = "single" | "bulk";

const TABS: { id: Mode; label: string }[] = [
  { id: "single", label: "Add Single Unit" },
  { id: "bulk", label: "Bulk Add Units" },
];

/** Mode toggle for the add-units page. Both panels stay mounted so switching never loses typed input. */
export function AddUnitsTabs({ single, bulk }: { single: ReactNode; bulk: ReactNode }) {
  const [mode, setMode] = useState<Mode>("single");
  return (
    <div>
      <div
        role="tablist"
        aria-label="How to add units"
        className="mb-6 inline-flex rounded-lg border border-border p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={mode === t.id}
            aria-controls={`panel-${t.id}`}
            type="button"
            onClick={() => setMode(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              mode === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-single" aria-labelledby="tab-single" hidden={mode !== "single"}>
        {single}
      </div>
      <div role="tabpanel" id="panel-bulk" aria-labelledby="tab-bulk" hidden={mode !== "bulk"}>
        {bulk}
      </div>
    </div>
  );
}
