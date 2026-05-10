import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "drizzle/0001_enable_rls.sql"),
  "utf8",
);

describe("RLS migration", () => {
  it("forces RLS on user-owned tables", () => {
    expect(migration).toContain("ALTER TABLE decisions FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE tenants FORCE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "ALTER TABLE audit_events FORCE ROW LEVEL SECURITY",
    );
  });

  it("uses WITH CHECK policies for writes", () => {
    expect(migration).toMatch(/WITH CHECK \([\s\S]*app\.current_tenant_id/);
    expect(migration).toMatch(/WITH CHECK \([\s\S]*app\.current_user_id/);
  });

  it("keeps unauthorized decision reads indistinguishable by tenant and user", () => {
    expect(migration).toContain("decisions_tenant_isolation");
    expect(migration).toContain(
      "tenant_id::text = current_setting('app.current_tenant_id', true)",
    );
    expect(migration).toContain(
      "user_id::text = current_setting('app.current_user_id', true)",
    );
  });
});
