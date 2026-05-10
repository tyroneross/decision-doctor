import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const authSource = readFileSync(join(process.cwd(), "lib/auth.ts"), "utf8");
const authRouteSource = readFileSync(
  join(process.cwd(), "app/api/auth/[...all]/route.ts"),
  "utf8",
);

describe("auth implementation contract", () => {
  it("uses Better Auth with Drizzle, magic link, and email/password", () => {
    expect(authSource).toContain("betterAuth");
    expect(authSource).toContain("drizzleAdapter");
    expect(authSource).toContain("magicLink");
    expect(authSource).toContain("emailAndPassword");
    expect(authSource).toContain("enabled: true");
  });

  it("sends auth links through Resend without exposing secret values", () => {
    expect(authSource).toContain("new Resend");
    expect(authSource).toContain("RESEND_API_KEY");
    expect(authSource).not.toContain("re_");
  });

  it("exports a Node runtime Better Auth route handler", () => {
    expect(authRouteSource).toContain('runtime = "nodejs"');
    expect(authRouteSource).toContain("toNextJsHandler");
  });
});
