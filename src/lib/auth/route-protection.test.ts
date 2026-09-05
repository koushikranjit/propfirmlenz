import { describe, expect, it } from "vitest";
import { safeNextPath } from "./current-admin";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "./session";

/**
 * Route protection and redirect safety — docs/ARCHITECTURE.md §6.2, §15.
 *
 * Session lifecycle (expired / revoked / suspended) is covered against real
 * PostgreSQL in auth.test.ts; this file covers the routing-layer guards.
 */
describe("admin route protection", () => {
  describe("safeNextPath — open redirect guard", () => {
    it("accepts a same-site admin path", () => {
      expect(safeNextPath("/admin/prop-firms")).toBe("/admin/prop-firms");
      expect(safeNextPath("/admin/prop-firms?page=2")).toBe(
        "/admin/prop-firms?page=2",
      );
    });

    it("rejects an absolute URL to another origin", () => {
      expect(safeNextPath("https://evil.test/admin")).toBeNull();
      expect(safeNextPath("http://evil.test")).toBeNull();
    });

    it("rejects a protocol-relative URL", () => {
      // `//evil.test` is a real open-redirect vector: the browser treats it as
      // an absolute URL on the current protocol.
      expect(safeNextPath("//evil.test")).toBeNull();
      expect(safeNextPath("//evil.test/admin")).toBeNull();
    });

    it("rejects a backslash-escaped variant", () => {
      expect(safeNextPath("/\\evil.test")).toBeNull();
    });

    it("rejects a same-site path outside /admin", () => {
      expect(safeNextPath("/prop-firms")).toBeNull();
      expect(safeNextPath("/")).toBeNull();
    });

    it("rejects the login page itself, avoiding a redirect loop", () => {
      expect(safeNextPath("/admin/login")).toBeNull();
    });

    it("rejects empty and missing input", () => {
      expect(safeNextPath("")).toBeNull();
      expect(safeNextPath(null)).toBeNull();
      expect(safeNextPath(undefined)).toBeNull();
    });
  });

  describe("session cookie attributes", () => {
    it("uses the __Host- prefix, which forces Secure, path=/ and no Domain", () => {
      expect(SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
    });

    it("is httpOnly and SameSite=Lax", () => {
      expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
      expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
      expect(SESSION_COOKIE_OPTIONS.path).toBe("/");
    });
  });
});
