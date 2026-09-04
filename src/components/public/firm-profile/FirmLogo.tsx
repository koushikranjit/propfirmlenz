import type { FirmViewImage } from "@/lib/view/firm-view";

/**
 * A firm's own logo — used unmodified, as a factual identifier of the firm it
 * represents. Never restyled, recoloured, or combined with Prop Firm Lenz
 * branding (CLAUDE.md §12.2 rule 9 `[LOCKED]`).
 *
 * A plain <img> rather than next/image, deliberately: these files are served
 * from the media CDN, whose host is configured per environment and is not
 * known at build time, and `media.width`/`height` are nullable so the
 * width/height contract next/image requires cannot always be met. The fixed
 * box below plus `object-contain` gives a stable aspect ratio either way, so
 * there is no layout shift (CLAUDE.md §7).
 */
export function FirmLogo({
  logo,
  size = 64,
}: {
  logo: FirmViewImage | null;
  size?: number;
}) {
  if (!logo) {
    return (
      <div
        aria-hidden
        className="shrink-0 rounded-[12px] border border-border-default bg-bg-elevated"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="shrink-0 overflow-hidden rounded-[12px] border border-border-default bg-bg-elevated"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- see the note above: CDN host is environment-configured and media dimensions are nullable. */}
      <img
        src={logo.url}
        alt={logo.alt}
        width={logo.width ?? size}
        height={logo.height ?? size}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </div>
  );
}
