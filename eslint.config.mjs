import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const roles = ["admin", "landlord", "tenant", "manager", "visitor"];

// Supabase clients live only in lib/supabase; role code must go through lib/services.
const supabaseClientPatterns = [
  {
    group: ["@supabase/*"],
    message: "Import Supabase through lib/supabase and lib/services, not directly.",
  },
  {
    group: ["@/lib/supabase/admin"],
    message: "The service-role client is server-only infrastructure (webhooks/jobs), not role UI code.",
  },
];

// A role may only import its own feature folder: app/<role>/** and features/<role>/**.
const boundaryRules = roles.map((role) => ({
  files: [`app/${role}/**/*.{ts,tsx}`, `features/${role}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...roles
            .filter((other) => other !== role)
            .map((other) => ({
              group: [`@/features/${other}`, `@/features/${other}/*`, `@/app/${other}/*`],
              message: `${role} code must not import from the ${other} area. Move shared code to components/, lib/, hooks/ or types/.`,
            })),
          ...supabaseClientPatterns,
        ],
      },
    ],
  },
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaryRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
