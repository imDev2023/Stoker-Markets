import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies the SQL migrations in `packages/db/migrations`. Used by tests and deploys, never by the Worker.
 *
 * It then refuses a database where any table of the `public` schema lacks Row-Level Security (#201): the API connects
 * as the tables' owner, whom it does not apply to, and with no policy every other role reads and writes nothing, so
 * a hosted Postgres's own HTTP API (Supabase's Data API) has nothing to give away over the same schema. The lint
 * checks the schema's snapshot for the same; this catches a table that only hand-written SQL made.
 */
export async function runMigrations(connectionString: string) {
  const client = postgres(connectionString, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "..", "migrations") });
    const open = await tablesWithoutRowSecurity(client);
    if (open.length) {
      throw new Error(
        `Migrated, but ${open.length === 1 ? "a table lacks" : "tables lack"} Row-Level Security: ${open.join(", ")}. ` +
          "Declare it in packages/db/src/schema.ts with .enableRLS() and generate the migration (#201).",
      );
    }
  } finally {
    await client.end();
  }
}

/** The tables of the `public` schema without Row-Level Security, by name; none on a database these migrations made. */
export async function tablesWithoutRowSecurity(client: postgres.Sql) {
  const rows = await client<{ relname: string }[]>`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    order by c.relname`;
  return rows.map((r) => r.relname);
}
