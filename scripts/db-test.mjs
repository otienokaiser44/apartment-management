#!/usr/bin/env node
// SQL test runner.
//
//   node scripts/db-test.mjs                 run against DATABASE_URL (default: local Supabase DB)
//   node scripts/db-test.mjs --standalone    create a throwaway database on a plain PostgreSQL server,
//                                            apply the Supabase stub + all migrations, run the tests,
//                                            drop it (no Docker / Supabase CLI needed; uses `psql`)
//   node scripts/db-test.mjs --seed          also load supabase/seed.sql and run tests/seed/*.sql instead
//   node scripts/db-test.mjs 030             only test files whose name contains "030"
//
// Each test file runs inside its own transaction and is rolled back, so the target database is left
// untouched. Requires `psql` on PATH.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(root, "supabase", "tests");
const migrationsDir = join(root, "supabase", "migrations");
const args = process.argv.slice(2);
const standalone = args.includes("--standalone");
const seedMode = args.includes("--seed");
const filter = args.find((a) => !a.startsWith("--"));

const baseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function withDb(url, db) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

function psql(url, argv, { quiet = true } = {}) {
  const r = spawnSync(
    "psql",
    [url, "-X", "-v", "ON_ERROR_STOP=1", ...(quiet ? ["-q"] : []), ...argv],
    { encoding: "utf8", cwd: testsDir },
  );
  if (r.error) {
    console.error(`Could not run psql: ${r.error.message}. Install the PostgreSQL client tools.`);
    process.exit(2);
  }
  return r;
}

let target = baseUrl;
let scratchDb = null;

if (standalone) {
  scratchDb = `apt_test_${Date.now()}`;
  const admin = withDb(baseUrl, "postgres");
  let r = psql(admin, ["-c", `create database ${scratchDb}`]);
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(2);
  }
  target = withDb(baseUrl, scratchDb);
  r = psql(target, ["-f", join(testsDir, "support", "supabase_stub.sql")]);
  if (r.status !== 0) {
    console.error("stub failed:\n" + r.stderr);
    process.exit(2);
  }
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) {
    r = psql(target, ["-f", join(migrationsDir, f)]);
    if (r.status !== 0) {
      console.error(`migration ${f} failed:\n${r.stderr}`);
      process.exit(2);
    }
  }
  console.log(`applied ${readdirSync(migrationsDir).length} migrations to ${scratchDb}`);
}

if (seedMode) {
  const r = psql(target, ["-f", join(root, "supabase", "seed.sql")]);
  if (r.status !== 0) {
    console.error("seed.sql failed:\n" + r.stderr);
    if (scratchDb) psql(withDb(baseUrl, "postgres"), ["-c", `drop database ${scratchDb}`]);
    process.exit(2);
  }
  console.log("applied supabase/seed.sql");
}

const suiteDir = seedMode ? join(testsDir, "seed") : testsDir;

const files = readdirSync(suiteDir)
  .filter((n) => /^\d+.*\.sql$/.test(n))
  .filter((n) => !filter || n.includes(filter))
  .sort();

let totalAssertions = 0;
let totalFailed = 0;
let failedFiles = 0;

for (const f of files) {
  const r = psql(target, ["-o", process.platform === "win32" ? "NUL" : "/dev/null", "-f", join(suiteDir, f)]);
  const lines = r.stderr.split(/\r?\n/);
  const oks = lines.filter((l) => /NOTICE:\s+ok - /.test(l)).length;
  const bad = lines.filter((l) => /NOTICE:\s+not ok - /.test(l));
  totalAssertions += oks + bad.length;
  totalFailed += bad.length;
  const hardError = lines.find((l) => /ERROR:/.test(l) && !/TEST FILE FAILED/.test(l));
  if (r.status !== 0 || bad.length || hardError) {
    failedFiles++;
    console.log(`FAIL ${f}  (${oks} ok, ${bad.length} not ok)`);
    for (const l of bad) console.log("  " + l.replace(/^.*NOTICE:\s+/, ""));
    if (hardError) console.log("  " + hardError.trim());
  } else {
    console.log(`PASS ${f}  (${oks} assertions)`);
  }
}

if (scratchDb) psql(withDb(baseUrl, "postgres"), ["-c", `drop database ${scratchDb}`]);

console.log(
  `\n${files.length} files, ${totalAssertions} assertions, ${totalFailed} failed, ${failedFiles} file(s) failed`,
);
process.exit(failedFiles ? 1 : 0);
