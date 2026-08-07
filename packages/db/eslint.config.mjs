import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
  The same config the rest of the workspace uses. This package has no React in
  it at all — the React rules simply never fire — but one config shape across
  five projects is worth more than a bespoke one here.
*/
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /*
      Pinned rather than detected. `eslint-plugin-react` looks for an installed
      `react` to read a version from, and warns on every run when it finds none.
      Adding React as a dependency of a database package to quiet a linter would
      be the wrong way round.
    */
    settings: { react: { version: "19.0" } },
    rules: {
      // A package has no routes of its own; the rule has nothing to check.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);
