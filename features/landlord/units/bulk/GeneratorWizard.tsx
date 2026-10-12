"use client";

import { useState } from "react";
import { generateUnitNumbers, validateGenerator, type BulkRow } from "@/lib/validation/bulkUnits";
import { inputClass, primaryBtn } from "./ui";

type Props = { onGenerate: (rows: BulkRow[]) => void };

const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

/** Option A: generate a numbered range for one floor with shared defaults. Output goes to the editable preview. */
export function GeneratorWizard({ onGenerate }: Props) {
  const [f, setF] = useState({
    floor: "1", pattern: "{floor}{number:02d}", start: "1", end: "10",
    unitType: "", bedrooms: "1", bathrooms: "1", monthlyRent: "", securityDeposit: "", currency: "KES",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const g = { floor: num(f.floor), pattern: f.pattern, start: num(f.start), end: num(f.end) };
  const sample = validateGenerator(g) ? [] : generateUnitNumbers(g);
  const hint = sample.length ? `${sample.length} units: ${sample[0]} … ${sample[sample.length - 1]}` : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateGenerator(g);
    if (problem) return setError(problem);
    setError(null);
    onGenerate(
      generateUnitNumbers(g).map((unitNumber) => ({
        unitNumber,
        floor: f.floor,
        unitType: f.unitType,
        bedrooms: f.bedrooms,
        bathrooms: f.bathrooms,
        monthlyRent: f.monthlyRent,
        securityDeposit: f.securityDeposit,
        currency: f.currency,
        description: "",
      })),
    );
  }

  const field = (k: keyof typeof f, label: string, opts: { type?: string; step?: string; hint?: string; span?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : undefined}>
      <label htmlFor={`gen-${k}`} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={`gen-${k}`} className={inputClass} value={f[k]} onChange={set(k)} type={opts.type ?? "text"} step={opts.step} />
      {opts.hint ? <p className="mt-1 text-xs text-muted-foreground">{opts.hint}</p> : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">1. Floor and naming</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("floor", "Floor number", { type: "number" })}
          {field("pattern", "Naming pattern", {
            hint: "{floor} = floor, {number:02d} = zero-padded counter. Add a prefix like A-{floor}{number:02d} if you like.",
          })}
          {field("start", "Counter from", { type: "number" })}
          {field("end", "Counter to", { type: "number" })}
        </div>
        {hint ? <p className="text-sm text-muted-foreground">Preview: {hint}</p> : null}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">2. Shared defaults (editable per unit afterwards)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("unitType", "Unit type")}
          {field("bedrooms", "Bedrooms", { type: "number" })}
          {field("bathrooms", "Bathrooms", { type: "number", step: "0.5" })}
          {field("monthlyRent", "Monthly rent", { type: "number", step: "0.01" })}
          {field("securityDeposit", "Security deposit", { type: "number", step: "0.01" })}
          {field("currency", "Currency")}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
      <button type="submit" className={primaryBtn}>Generate preview</button>
    </form>
  );
}
