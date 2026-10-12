import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePostAuthPath, safeInternalPath } from "./redirects.ts";

test("safeInternalPath accepts internal paths only", () => {
  assert.equal(safeInternalPath("/tenant/payments?x=1"), "/tenant/payments?x=1");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil", "", null, undefined, "/a\nb"]) {
    assert.equal(safeInternalPath(bad), null, String(bad));
  }
});

test("resolvePostAuthPath keeps users inside their own area", () => {
  assert.equal(resolvePostAuthPath("tenant", "/tenant/payments"), "/tenant/payments");
  assert.equal(resolvePostAuthPath("tenant", "/landlord"), "/tenant");
  assert.equal(resolvePostAuthPath("tenant", "/admin/users"), "/tenant");
  assert.equal(resolvePostAuthPath("landlord", "//evil.com"), "/landlord");
  assert.equal(resolvePostAuthPath("landlord", undefined), "/landlord");
  assert.equal(resolvePostAuthPath("manager", "/landlord/properties"), "/landlord/properties");
  assert.equal(resolvePostAuthPath("manager", "/tenant"), "/landlord");
  assert.equal(resolvePostAuthPath("manager", "/admin"), "/landlord");
  assert.equal(resolvePostAuthPath("tenant", "/staff-invite?token=x"), "/staff-invite?token=x");
  assert.equal(resolvePostAuthPath("admin", "/admin"), "/admin");
  assert.equal(resolvePostAuthPath("tenant", "/visitor"), "/visitor");
});
