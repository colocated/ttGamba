/*
  The schema and migration paths are the workspace's convention, and the
  datasource is deliberately `DATABASE_URL` alone rather than the app's own
  Turso-first resolution — see `cliDatabaseUrl` in @tt/db for why that
  distinction is load-bearing rather than tidy.
*/
import { userAppPrismaConfig } from "@tt/db/prisma-config";

export default userAppPrismaConfig();
