import { Badge } from "@/components/ui/primitives";
import { formatDate } from "@/lib/view/format";
import type { FirmView } from "@/lib/view/firm-view";
import { AffiliateCta } from "./AffiliateCta";
import { FirmLogo } from "./FirmLogo";

/**
 * The firm identity block — docs/DESIGN.md §7.
 *
 * Verification is stated with TEXT and a date, never a colour or an icon
 * alone (docs/DESIGN.md §2.5 rule 5). "Verified" here means an admin checked
 * the recorded data against the firm's published sources on that date — it is
 * not an endorsement, and the copy says so.
 */
export function FirmHeader({
  firm,
  preview,
}: {
  firm: FirmView;
  preview: boolean;
}) {
  const verifiedOn = formatDate(firm.verifiedAt);

  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <FirmLogo logo={firm.logo} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
              {firm.name}
            </h1>
            {firm.isVerified ? (
              <Badge tone="success">
                {verifiedOn ? `Data verified ${verifiedOn}` : "Data verified"}
              </Badge>
            ) : (
              <Badge tone="neutral">Data not yet verified</Badge>
            )}
          </div>

          {firm.tagline ? (
            <p className="mt-2 text-base text-text-secondary">{firm.tagline}</p>
          ) : null}

          {firm.legalName ? (
            <p className="mt-2 text-sm text-text-muted">
              Operated by {firm.legalName}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <AffiliateCta firm={firm} preview={preview} placement="firm_header" />
      </div>
    </header>
  );
}
