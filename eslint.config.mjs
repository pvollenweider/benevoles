import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    ".understand-anything/**",
  ]),
  {
    rules: {
      // Les apostrophes et guillemets français dans le JSX sont intentionnels
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Tenant isolation (#268): admin code reaches the DB through the org-scoped client (`db`
    // from requireOrgSession()/getOrgContext(), see src/lib/prisma-org.ts), never the raw one.
    // A file that really needs it (non-tenant models, deliberately cross-tenant checks) disables
    // this rule on its import line with the reason.
    files: ["src/app/api/admin/**", "src/app/admin/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/prisma",
          message: "Use the org-scoped `db` from requireOrgSession()/getOrgContext() (src/lib/prisma-org.ts). If this file truly needs the raw client, disable this rule on the import with the reason.",
        }],
      }],
    },
  },
]);

export default eslintConfig;
