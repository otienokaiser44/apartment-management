#!/usr/bin/env node
// One-off generator for the tail of supabase/migrations/033_staff_access.sql.
// It copies existing RPC/view definitions from 027/028/030 and swaps in delegation-aware checks, so the bodies are not
// retyped by hand. Every substitution must match exactly once or the script aborts (and writes nothing).
//
//   node scripts/gen-033-tail.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const file = (prefix) => join(dir, readdirSync(dir).find((n) => n.startsWith(prefix)));
const text = (prefix) => readFileSync(file(prefix), "utf8");

function extractFunction(src, name) {
  const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`);
  const m = re.exec(src);
  if (!m) throw new Error(`function ${name} not found`);
  return m[0];
}

function replaceOnce(body, from, to, label) {
  const parts = body.split(from);
  if (parts.length !== 2) throw new Error(`${label}: expected exactly one match, found ${parts.length - 1}`);
  return parts.join(to);
}

const OWNER_ID = (unitVar) =>
  `\n  -- Records always carry the OWNER's landlord id, whoever (owner or manager) acts.\n  select pr.landlord_id into v_landlord from public.properties pr where pr.id = ${unitVar};`;

const out = [];

// --- create_tenant_invitation (027) ------------------------------------------------------------------------
{
  let b = extractFunction(text("027_"), "create_tenant_invitation");
  b = replaceOnce(
    b,
    `  if v_landlord is null then\n    raise exception 'only landlords can invite tenants' using errcode = '42501';\n  end if;`,
    `  if v_landlord is null and not public.is_manager() then\n    raise exception 'only landlords can invite tenants' using errcode = '42501';\n  end if;`,
    "invite guard",
  );
  b = replaceOnce(
    b,
    `  if not found or not public.owns_property(v_unit.property_id) then\n    raise exception 'unit not found' using errcode = 'P0002';\n  end if;`,
    `  if not found or not public.owns_property(v_unit.property_id) then\n    raise exception 'unit not found' using errcode = 'P0002';\n  end if;${OWNER_ID("v_unit.property_id")}`,
    "invite owner id",
  );
  out.push(b);
}

// --- create_tenant_invitations_bulk (030) -------------------------------------------------------------------
{
  let b = extractFunction(text("030_"), "create_tenant_invitations_bulk");
  b = replaceOnce(
    b,
    `  if v_landlord is null then\n    raise exception 'only landlords can invite tenants' using errcode = '42501';\n  end if;`,
    `  if v_landlord is null and not public.is_manager() then\n    raise exception 'only landlords can invite tenants' using errcode = '42501';\n  end if;`,
    "bulk guard",
  );
  b = replaceOnce(
    b,
    `  if not public.owns_property(p_property_id) then\n    raise exception 'property not found' using errcode = 'P0002';\n  end if;`,
    `  if not public.owns_property(p_property_id) then\n    raise exception 'property not found' using errcode = 'P0002';\n  end if;${OWNER_ID("p_property_id")}`,
    "bulk owner id",
  );
  out.push(b);
}

// --- request_tenant_link (030) ----------------------------------------------------------------------------------
{
  let b = extractFunction(text("030_"), "request_tenant_link");
  b = replaceOnce(
    b,
    `  if v_landlord is null then\n    raise exception 'only landlords can link tenants' using errcode = '42501';\n  end if;`,
    `  if v_landlord is null and not public.is_manager() then\n    raise exception 'only landlords can link tenants' using errcode = '42501';\n  end if;`,
    "link guard",
  );
  b = replaceOnce(
    b,
    `  if not found or not public.owns_property(v_unit.property_id) then\n    raise exception 'unit not found' using errcode = 'P0002';\n  end if;`,
    `  if not found or not public.owns_property(v_unit.property_id) then\n    raise exception 'unit not found' using errcode = 'P0002';\n  end if;${OWNER_ID("v_unit.property_id")}`,
    "link owner id",
  );
  out.push(b);
}

// --- cancel_tenant_link_request (030) ---------------------------------------------------------------------------
{
  let b = extractFunction(text("030_"), "cancel_tenant_link_request");
  b = replaceOnce(
    b,
    `where id = p_request_id and landlord_id = public.my_landlord_profile_id() for update;`,
    `where id = p_request_id and public.owns_unit(unit_id) for update;`,
    "cancel scope",
  );
  out.push(b);
}

// --- landlord overview views (028): visible to owner AND property managers -----------------------------------
{
  const src = text("028_");
  const view = (name, from, to) => {
    const re = new RegExp(`create view public\\.${name} with \\(security_barrier = true\\) as[\\s\\S]*?;\\n`);
    const m = re.exec(src);
    if (!m) throw new Error(`view ${name} not found`);
    let v = m[0].replace("create view", "create or replace view");
    v = replaceOnce(v, from, to, name);
    return v;
  };
  out.push(
    view("landlord_tenancy_overview", "where te.landlord_id = public.my_landlord_profile_id();", "where public.owns_tenancy(te.id);"),
    view("landlord_application_overview", "where pr.landlord_id = public.my_landlord_profile_id();", "where public.owns_property(pr.id);"),
  );
}

const target = file("033_");
const head = readFileSync(target, "utf8");
const marker = "-- Delegation-aware replacements";
const cut = head.indexOf(marker);
if (cut < 0) throw new Error("marker not found in 033");
const keep = head.slice(0, head.indexOf("\n", head.indexOf("-- ====", cut)) + 1);
writeFileSync(target, `${keep}\n${out.join("\n\n")}\n`);
console.log(`wrote ${out.length} definitions to ${target}`);
