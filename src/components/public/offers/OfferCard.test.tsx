import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicOffer } from "@/lib/repositories/public-offers";
import { OfferCard } from "./OfferCard";

/**
 * THE OFFER CARD — docs/DATABASE.md §5.7.
 *
 * Two guarantees, both about not misleading a reader:
 *
 *  - the copy button puts the SHOWN code on the clipboard, not a different
 *    one. A button that copies something else is worse than no button;
 *  - a missing percentage renders nothing. "Up to 20% off" invented to fill a
 *    card is a commercial claim about a real company (CLAUDE.md §3 `[LOCKED]`).
 */

afterEach(cleanup);

function offer(over: Partial<PublicOffer> = {}): PublicOffer {
  return {
    id: "offer-1",
    firmSlug: "example-firm-a",
    firmName: "Example Firm A",
    logo: null,
    title: "Launch offer",
    description: null,
    terms: null,
    code: "LENZ",
    discountType: null,
    discountValue: null,
    discountCurrency: null,
    endsAt: null,
    hasAffiliateLink: false,
    ...over,
  };
}

describe("offer card", () => {
  /* -------------------------------------------------------------- (6) copy */

  it("copies the ACTUAL stored code, not the default", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const { container } = render(<OfferCard offer={offer({ code: "SAVE10" })} />);
    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));

    expect(writeText).toHaveBeenCalledWith("SAVE10");
    // What is SHOWN and what is COPIED must be the same string — a button
    // that copies something other than the visible code is worse than none.
    expect(container.querySelector("code")?.textContent).toBe("SAVE10");

    vi.unstubAllGlobals();
  });

  it("copies the default when that is what the offer resolved to", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const { container } = render(<OfferCard offer={offer()} />);
    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));

    expect(writeText).toHaveBeenCalledWith("LENZ");
    expect(container.querySelector("code")?.textContent).toBe("LENZ");
    vi.unstubAllGlobals();
  });

  /* ------------------------------------------------------- (7) no invention */

  it("shows the code but NO discount when none was published", () => {
    const { container } = render(<OfferCard offer={offer()} />);

    expect(screen.getByText("Code:")).toBeTruthy();
    // No percentage anywhere — not "0%", not "up to", nothing.
    expect(container.textContent).not.toMatch(/\d+\s*%/);
    expect(container.textContent).not.toMatch(/up to/i);
    expect(container.textContent).not.toMatch(/ends/i);
  });

  it("shows the discount exactly as stored when one exists", () => {
    const { container } = render(
      <OfferCard
        offer={offer({ discountType: "percent", discountValue: "20.00" })}
      />,
    );
    expect(container.textContent).toContain("20%");
  });

  it("states an end date only when the firm published one", () => {
    const { container } = render(
      <OfferCard offer={offer({ endsAt: "2030-06-01T00:00:00.000Z" })} />,
    );
    expect(container.textContent).toMatch(/Ends .*2030/);
  });

  it("renders no description or terms block when they are absent", () => {
    const { container } = render(<OfferCard offer={offer()} />);
    // Title, firm name, the code and the CTA — and nothing invented between.
    expect(container.textContent).toContain("Example Firm A");
    expect(container.textContent).toContain("Launch offer");
    expect(container.querySelectorAll("p").length).toBeLessThanOrEqual(3);
  });
});
