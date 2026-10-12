#!/usr/bin/env node
// One-off generator for the tail of supabase/migrations/035_tenant_portal.sql.
// It copies send_announcement from 031 and adds a `p_category` argument, so the body is not retyped by hand.
// Every substitution must match exactly once or the script aborts without writing anything.
//
//   node scripts/gen-035-tail.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const file = (prefix) => join(dir, readdirSync(dir).find((n) => n.startsWith(prefix)));

const target = file("035_");
const existing = readFileSync(target, "utf8");
if (existing.includes("create or replace function public.send_announcement")) {
  console.log("035 already contains send_announcement; nothing to do");
  process.exit(0);
}

const src = readFileSync(file("031_"), "utf8");
const m = /create or replace function public\.send_announcement\([\s\S]*?\n\$\$;/.exec(src);
if (!m) throw new Error("send_announcement not found in 031");
let body = m[0];

function replaceOnce(from, to, label) {
  const parts = body.split(from);
  if (parts.length !== 2) throw new Error(`${label}: expected exactly one match, found ${parts.length - 1}`);
  body = parts.join(to);
}

replaceOnce(
  "  p_value text default null,\n  p_expires_at timestamptz default null\n)",
  "  p_value text default null,\n  p_expires_at timestamptz default null,\n  p_category text default 'general'\n)",
  "signature",
);
replaceOnce(
  "  if p_audience not in ('all', 'floor', 'unit', 'unpaid_only') then\n    raise exception 'unknown audience' using errcode = '22023';\n  end if;",
  "  if p_audience not in ('all', 'floor', 'unit', 'unpaid_only') then\n    raise exception 'unknown audience' using errcode = '22023';\n  end if;\n  if p_category is null or p_category not in ('general', 'maintenance', 'urgent') then\n    raise exception 'unknown category' using errcode = '22023';\n  end if;",
  "category check",
);
replaceOnce(
  "  insert into public.notices (created_by, property_id, unit_id, title, body, expires_at, target_audience, target_value)\n  values (v_uid, p_property_id, v_unit, btrim(p_title), p_message, p_expires_at, p_audience,\n          case when p_audience in ('floor', 'unit') then p_value end)",
  "  insert into public.notices (created_by, property_id, unit_id, title, body, expires_at, target_audience, target_value, category)\n  values (v_uid, p_property_id, v_unit, btrim(p_title), p_message, p_expires_at, p_audience,\n          case when p_audience in ('floor', 'unit') then p_value end, p_category)",
  "insert",
);

const out = [
  "",
  "-- The old six-argument version is replaced (keeping both would make named-argument calls ambiguous).",
  "drop function if exists public.send_announcement(uuid, text, text, text, text, timestamptz);",
  "",
  body,
  "",
  "revoke all on function public.send_announcement(uuid, text, text, text, text, timestamptz, text) from public, anon;",
  "grant execute on function public.send_announcement(uuid, text, text, text, text, timestamptz, text) to authenticated, service_role;",
  "",
].join("\n");

writeFileSync(target, existing.replace(/\n*$/, "\n") + out);
console.log(`appended send_announcement (with category) to ${target}`);
