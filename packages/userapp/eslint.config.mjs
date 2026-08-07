import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
  The same config the apps use. These packages are compiled by each app's own
  Next build (they are listed in `transpilePackages`), so they are held to the
  same rules — a `next/link` misuse in here is a `next/link` misuse everywhere it
  is rendered, and finding it in the app that imported it rather than the package
  that wrote it is the slower way round.
*/
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /*
        A package has no routes of its own. The rule looks for a `pages` or
        `app` directory to check hrefs against, cannot find one, and prints a
        line about it on every run — it has nothing to say here either way.
      */
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);
