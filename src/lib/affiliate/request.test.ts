import { describe, expect, it } from "vitest";
import { affiliateHref, isSafeAffiliateDestination } from "./link";
import {
  campaignFrom,
  countryCodeFrom,
  deviceTypeFrom,
  isBotUserAgent,
  isPrefetch,
  isValidFirmSlug,
  landingPathFrom,
  placementFrom,
  referrerHostFrom,
} from "./request";

/** docs/ARCHITECTURE.md §11.2, §11.3 — the pure layer under `/go/{slug}`. */

describe("isSafeAffiliateDestination — the open-redirect guard", () => {
  it("accepts an absolute https destination", () => {
    expect(
      isSafeAffiliateDestination("https://partner.example.test/a?b=c"),
    ).toBe(true);
  });

  it("rejects every shape that could become an open redirect", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      // Protocol-relative: a browser would resolve this to another origin.
      "//evil.example/path",
      "/prop-firms/example-firm-a",
      "prop-firms/example-firm-a",
      "",
      "   ",
      "not a url at all",
      "https://",
      "https:///path",
    ]) {
      expect(isSafeAffiliateDestination(hostile)).toBe(false);
    }
  });

  it("rejects plain http — a tracked redirect is never downgraded", () => {
    expect(isSafeAffiliateDestination("http://partner.example.test")).toBe(
      false,
    );
  });

  it("rejects embedded credentials, a phishing vector", () => {
    expect(
      isSafeAffiliateDestination("https://user:pass@partner.example.test"),
    ).toBe(false);
  });
});

describe("slug validation", () => {
  it("accepts the documented public slug shape", () => {
    expect(isValidFirmSlug("example-firm-a")).toBe(true);
    expect(isValidFirmSlug("firm123")).toBe(true);
  });

  it("rejects traversal, encoding and separator abuse", () => {
    for (const bad of [
      "../admin",
      "..%2Fadmin",
      "Example-Firm-A",
      "example_firm",
      "-leading",
      "trailing-",
      "double--hyphen",
      "with space",
      "with/slash",
      "",
      "a".repeat(101),
    ]) {
      expect(isValidFirmSlug(bad)).toBe(false);
    }
  });
});

describe("bot and prefetch classification", () => {
  it("flags known non-human clients", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "HeadlessChrome/120.0.0.0",
      "facebookexternalhit/1.1",
    ]) {
      expect(isBotUserAgent(ua)).toBe(true);
    }
  });

  it("treats a missing user agent as non-human", () => {
    expect(isBotUserAgent(null)).toBe(true);
  });

  it("does not flag an ordinary browser", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("detects a prefetch, which is not a click", () => {
    expect(isPrefetch(new Headers({ "Sec-Purpose": "prefetch" }))).toBe(true);
    expect(isPrefetch(new Headers({ Purpose: "prefetch" }))).toBe(true);
    expect(isPrefetch(new Headers({ "X-Moz": "prefetch" }))).toBe(true);
    expect(isPrefetch(new Headers({ "Next-Router-Prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers({ Accept: "text/html" }))).toBe(false);
  });
});

describe("device classification", () => {
  it("reports tablets as tablets, not mobiles", () => {
    // An iPad's user agent also contains "Mobile"; order matters.
    expect(
      deviceTypeFrom(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      ),
    ).toBe("tablet");
  });

  it("classifies phones and desktops", () => {
    expect(deviceTypeFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(
      "mobile",
    );
    expect(deviceTypeFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "desktop",
    );
    expect(deviceTypeFrom(null)).toBeNull();
  });
});

describe("privacy-preserving request fields", () => {
  it("keeps the referring HOST only, never the full URL", () => {
    expect(
      referrerHostFrom("https://search.example.test/results?q=personal+data"),
    ).toBe("search.example.test");
    expect(referrerHostFrom("garbage")).toBeNull();
    expect(referrerHostFrom(null)).toBeNull();
  });

  it("records a landing path only for a same-origin referer", () => {
    const origin = "https://propfirmlenz.com";
    expect(
      landingPathFrom(
        "https://propfirmlenz.com/prop-firms/example-firm-a",
        origin,
      ),
    ).toBe("/prop-firms/example-firm-a");
    // Another site's path is their data, not our landing page.
    expect(
      landingPathFrom("https://other.example.test/secret", origin),
    ).toBeNull();
  });

  it("accepts only a well-formed country code", () => {
    expect(countryCodeFrom("gb")).toBe("GB");
    expect(countryCodeFrom("GBR")).toBeNull();
    expect(countryCodeFrom("")).toBeNull();
    expect(countryCodeFrom(null)).toBeNull();
  });
});

describe("attacker-controlled reporting parameters", () => {
  it("drops a placement outside the allowlisted shape", () => {
    expect(placementFrom("firm_header")).toBe("firm_header");
    expect(placementFrom("<script>")).toBeNull();
    expect(placementFrom("a".repeat(65))).toBeNull();
    expect(placementFrom(null)).toBeNull();
  });

  it("drops a campaign outside the allowlisted shape", () => {
    expect(campaignFrom("spring-2026")).toBe("spring-2026");
    expect(campaignFrom("' or 1=1 --")).toBeNull();
    expect(campaignFrom(null)).toBeNull();
  });

  it("round-trips the href the CTA builds", () => {
    const href = affiliateHref("example-firm-a", {
      placement: "firm_header",
      campaign: "spring-2026",
    });
    expect(href).toBe("/go/example-firm-a?p=firm_header&c=spring-2026");

    const url = new URL(href!, "https://propfirmlenz.com");
    expect(placementFrom(url.searchParams.get("p"))).toBe("firm_header");
    expect(campaignFrom(url.searchParams.get("c"))).toBe("spring-2026");
  });
});
