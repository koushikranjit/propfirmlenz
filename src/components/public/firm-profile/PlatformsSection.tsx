import { Badge } from "@/components/ui/primitives";
import { ASSET_CLASS_LABEL, labelFor } from "@/lib/view/format";
import type {
  FirmViewInstrument,
  FirmViewPlatform,
} from "@/lib/view/firm-view";
import { NoData } from "./Section";

/**
 * Platforms a firm supports.
 *
 * Only platforms with a stored `firm_platforms` row appear. Absence means the
 * relationship has not been recorded — never that the platform is unsupported
 * (CLAUDE.md §3).
 */
export function PlatformsSection({
  platforms,
  firmName,
}: {
  platforms: FirmViewPlatform[];
  firmName: string;
}) {
  if (platforms.length === 0) {
    return (
      <NoData>
        No trading platforms have been recorded for {firmName} yet.
      </NoData>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {platforms.map((platform) => (
        <li key={platform.id}>
          <span className="inline-flex items-center gap-2 rounded-[10px] border border-border-default bg-bg-card px-3 py-2 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">
              {platform.name}
            </span>
            {platform.isPrimary ? <Badge tone="info">Primary</Badge> : null}
            {platform.notes ? (
              <span className="text-text-muted">{platform.notes}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tradable instruments.
 *
 * `isAllowed === false` means EXPLICITLY prohibited, which is different
 * information from "no row at all" — the two are rendered differently on
 * purpose (docs/DATABASE.md §5.6).
 */
export function InstrumentsSection({
  instruments,
  firmName,
}: {
  instruments: FirmViewInstrument[];
  firmName: string;
}) {
  if (instruments.length === 0) {
    return (
      <NoData>
        No instrument availability has been recorded for {firmName} yet.
      </NoData>
    );
  }

  const allowed = instruments.filter((i) => i.isAllowed);
  const prohibited = instruments.filter((i) => !i.isAllowed);

  return (
    <div className="flex flex-col gap-4">
      {allowed.length > 0 ? (
        <InstrumentGroup title="Tradable" items={allowed} tone="success" />
      ) : null}
      {prohibited.length > 0 ? (
        <InstrumentGroup
          title="Explicitly not tradable"
          items={prohibited}
          tone="danger"
        />
      ) : null}
    </div>
  );
}

function InstrumentGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: FirmViewInstrument[];
  tone: "success" | "danger";
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((instrument) => (
          <li key={instrument.id}>
            <span className="inline-flex items-center gap-2 rounded-[10px] border border-border-default bg-bg-card px-3 py-2 text-sm">
              <span className="font-medium text-text-primary">
                {instrument.name}
              </span>
              <Badge tone={tone === "success" ? "neutral" : "danger"}>
                {labelFor(ASSET_CLASS_LABEL, instrument.assetClass) ??
                  instrument.assetClass}
              </Badge>
              {instrument.notes ? (
                <span className="text-text-muted">{instrument.notes}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
