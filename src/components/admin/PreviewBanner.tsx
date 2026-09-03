/**
 * The PREVIEW indicator — docs/DESIGN.md §15.4, docs/ADMIN.md §7A.5 `[LOCKED]`.
 *
 * Pinned inside the previewed document so it survives full-page preview and
 * scrolling. Non-dismissible, non-collapsible, not animated.
 *
 * Uses `--warning` with a hatched edge, and NEVER the brand gradient or cyan —
 * preview chrome must not be mistakable for product chrome.
 */
export function PreviewBanner({ pendingChanges }: { pendingChanges: number }) {
  return (
    <div role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 bg-warning/12 px-4 py-2.5 text-sm font-semibold text-warning">
        <span aria-hidden>⚠</span>
        <span>PREVIEW — DRAFT, NOT PUBLISHED</span>
        <span className="font-normal opacity-90">
          {pendingChanges > 0
            ? `· ${pendingChanges} pending change${pendingChanges === 1 ? "" : "s"}`
            : "· No pending changes — identical to the published page"}
        </span>
      </div>
      {/* 4px hatched edge (docs/DESIGN.md §15.4). */}
      <div
        aria-hidden
        className="h-1 w-full"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--warning) 0 6px, transparent 6px 12px)",
        }}
      />
    </div>
  );
}
