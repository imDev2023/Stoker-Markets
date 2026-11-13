// Row-Level Security on every table, with no policy (#201). The API connects as the tables' owner, whom it does not
// apply to, so every other file of this suite is the proof that nothing of ours changed: the stack's database belongs
// to a plain role, as on the hosted databases, and never to a superuser. This file proves the other half: a role that
// was granted everything on the tables, as Supabase grants its Data API's roles, still reads and writes nothing.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "./client";

describe("Row-Level Security", () => {
  const outsider = `rls_outsider_${process.pid}_${Date.now()}`;
  let owner: postgres.Sql;
  let admin: postgres.Sql;

  beforeAll(async () => {
    const h = env();
    owner = postgres(h.databaseUrl, { max: 1, onnotice: () => {} });
    admin = postgres(h.databaseAdminUrl, { max: 1, onnotice: () => {} });
    // What Supabase gives `anon` and `authenticated` on a new project: the schema, and every privilege on its tables.
    await admin.unsafe(`create role ${outsider} nologin`);
    await admin.unsafe(`grant usage on schema public to ${outsider}`);
    await admin.unsafe(`grant all on all tables in schema public to ${outsider}`);
  });

  afterAll(async () => {
    // A role belongs to the server, which outlives this stack's database wherever `STACK_DATABASE_URL` names one.
    await admin.unsafe(`drop owned by ${outsider}`).catch(() => undefined);
    await admin.unsafe(`drop role if exists ${outsider}`).catch(() => undefined);
    await owner.end();
    await admin.end();
  });

  const tables = async () => (await owner<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' order by tablename`).map((t) => t.tablename);

  it("is on for every table, and no table has a policy", async () => {
    // The issue's acceptance query, word for word.
    const [open] = await owner<{ count: number }[]>`
      select count(*)::int as count from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(open!.count).toBe(0);
    expect((await tables()).length).toBeGreaterThan(30);
    // A policy would open a table to some role; none is planned, so one appearing is a change somebody must mean.
    expect(await owner`select tablename, policyname from pg_policies where schemaname = 'public'`).toEqual([]);
  });

  it("leaves the API as it was: it connects as the tables' owner, a role that is neither a superuser nor exempt", async () => {
    const [me] = await owner<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    expect(me).toEqual({ rolsuper: false, rolbypassrls: false });
    expect(await owner`select tablename from pg_tables where schemaname = 'public' and tableowner <> current_user`).toEqual([]);
    // Forcing it would apply it to the owner too, and the API would read nothing.
    expect(await owner`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relforcerowsecurity`).toEqual([]);
    // The stack filled the Quote Registry before any test ran, and the owner reads it.
    const [quotes] = await owner<{ count: number }[]>`select count(*)::int as count from quote_assets`;
    expect(quotes!.count).toBeGreaterThan(0);
  });

  it("gives a role with every privilege on the tables no row of any of them", async () => {
    const names = await tables();
    let ownerRows = 0;
    for (const table of names) {
      const [mine] = await owner.unsafe<{ count: number }[]>(`select count(*)::int as count from "${table}"`);
      ownerRows += mine!.count;
      const theirs = await admin.begin(async (tx) => {
        await tx.unsafe(`set local role ${outsider}`);
        const [row] = await tx.unsafe<{ count: number }[]>(`select count(*)::int as count from "${table}"`);
        return row!.count;
      });
      expect(theirs, `${table} as ${outsider}`).toBe(0);
    }
    expect(ownerRows).toBeGreaterThan(0);
  });

  it("refuses that role's writes", async () => {
    const write = (statement: string) =>
      admin.begin(async (tx) => {
        await tx.unsafe(`set local role ${outsider}`);
        return await tx.unsafe(statement);
      });
    await expect(write(`insert into job_locks (job, run_id, expires_at) values ('row-security.test', 'outsider', now())`)).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("row-level security"),
    });
    // An update or a delete finds no row to touch, so it changes none and says so.
    expect((await write(`update quote_assets set symbol = symbol`)).count).toBe(0);
    expect((await write(`delete from quote_assets`)).count).toBe(0);
    const [quotes] = await owner<{ count: number }[]>`select count(*)::int as count from quote_assets`;
    expect(quotes!.count).toBeGreaterThan(0);
    expect(await owner`select job from job_locks where job = 'row-security.test'`).toEqual([]);
  });
});
