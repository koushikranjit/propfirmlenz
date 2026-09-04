"use client";

import { useActionState } from "react";
import {
  type ActionResult,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Badge, Card, Input } from "@/components/ui/primitives";
import type {
  AdminCatalog,
  AdminFirmChildren,
} from "@/lib/repositories/admin-firm-children";
import {
  saveInstrumentAction,
  savePlatformAction,
} from "@/lib/services/firm-child-actions";

/**
 * Platform and instrument associations — docs/PROJECT.md §6.2 `[LOCKED]`.
 *
 * An admin SELECTS from the canonical catalog by id. There is no free-text
 * entry, because "MetaTrader 5", "MT5" and "mt5" typed by three admins would
 * become three platforms, and every filter, facet and comparison built on them
 * would quietly fragment. Creating a catalog record is a separate
 * `catalog:manage` concern and is not part of the firm editor.
 *
 * INSTRUMENTS CARRY THREE STATES, not two:
 *
 *   tradable · explicitly prohibited · no row at all
 *
 * "Explicitly prohibited" is a fact the firm published; "no row" means nobody
 * has recorded anything. The public page renders them differently, so the
 * editor must let an admin express both (docs/DATABASE.md §5.6).
 */
export function AssociationsTab({
  firmId,
  catalog,
  firmChildren,
  stagedPlatformIds,
  stagedInstrumentIds,
  readOnly,
}: {
  firmId: string;
  catalog: AdminCatalog;
  firmChildren: AdminFirmChildren;
  stagedPlatformIds: Set<string>;
  stagedInstrumentIds: Set<string>;
  readOnly: boolean;
}) {
  const [platformState, platformAction] = useActionState<
    ActionResult,
    FormData
  >(savePlatformAction, {});
  const [instrumentState, instrumentAction] = useActionState<
    ActionResult,
    FormData
  >(saveInstrumentAction, {});

  const linkedPlatforms = new Map(
    firmChildren.platformIds.map((p) => [p.platformId, p]),
  );
  const linkedInstruments = new Map(
    firmChildren.instrumentIds.map((i) => [i.instrumentId, i]),
  );

  return (
    <div className="flex flex-col gap-6">
      <StatusMessage state={platformState} />
      <StatusMessage state={instrumentState} />

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-text-primary">Platforms</h3>
        <p className="mt-1 text-sm text-text-muted">
          Only platforms this firm actually supports. Leaving one unselected
          means “not recorded”, not “unsupported”.
        </p>

        {catalog.platforms.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            No platforms exist in the catalog yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {catalog.platforms.map((platform) => {
              const linked = linkedPlatforms.get(platform.id);
              const staged = stagedPlatformIds.has(platform.id);
              return (
                <li
                  key={platform.id}
                  className="rounded-[10px] border border-border-subtle p-3"
                >
                  <form
                    action={platformAction}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="firmId" value={firmId} />
                    <input
                      type="hidden"
                      name="platformId"
                      value={platform.id}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                        {platform.name}
                        {linked ? <Badge tone="success">Linked</Badge> : null}
                        {staged ? (
                          <Badge tone="warning">Change staged</Badge>
                        ) : null}
                      </p>
                      <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          name="isPrimary"
                          defaultChecked={linked?.isPrimary ?? false}
                          disabled={readOnly}
                          className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                        />
                        Primary platform
                      </label>
                    </div>

                    <div className="min-w-0 flex-1 basis-48">
                      <label
                        htmlFor={`platform-notes-${platform.id}`}
                        className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
                      >
                        Notes
                      </label>
                      <Input
                        id={`platform-notes-${platform.id}`}
                        name="notes"
                        defaultValue={linked?.notes ?? ""}
                        disabled={readOnly}
                        className="mt-1"
                      />
                    </div>

                    {!readOnly ? (
                      <div className="flex gap-2">
                        <SubmitButton size="sm" pendingLabel="Staging…">
                          {linked ? "Update" : "Link"}
                        </SubmitButton>
                        {linked ? (
                          <button
                            type="submit"
                            name="remove"
                            value="true"
                            className="inline-flex h-8 items-center rounded-[10px] border border-danger/40 bg-danger/12 px-3 text-xs font-medium text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                          >
                            Unlink
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-text-primary">Instruments</h3>
        <p className="mt-1 text-sm text-text-muted">
          Tick “tradable” for instruments the firm allows. Link one with
          “tradable” unticked to record that the firm explicitly prohibits it —
          that is different information from leaving it unlinked.
        </p>

        {catalog.instruments.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            No instruments exist in the catalog yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {catalog.instruments.map((instrument) => {
              const linked = linkedInstruments.get(instrument.id);
              const staged = stagedInstrumentIds.has(instrument.id);
              return (
                <li
                  key={instrument.id}
                  className="rounded-[10px] border border-border-subtle p-3"
                >
                  <form
                    action={instrumentAction}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="firmId" value={firmId} />
                    <input
                      type="hidden"
                      name="instrumentId"
                      value={instrument.id}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                        {instrument.name}
                        <span className="text-xs text-text-muted">
                          {instrument.assetClass}
                        </span>
                        {linked ? (
                          <Badge tone={linked.isAllowed ? "success" : "danger"}>
                            {linked.isAllowed
                              ? "Tradable"
                              : "Explicitly prohibited"}
                          </Badge>
                        ) : null}
                        {staged ? (
                          <Badge tone="warning">Change staged</Badge>
                        ) : null}
                      </p>
                      <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          name="isAllowed"
                          defaultChecked={linked?.isAllowed ?? true}
                          disabled={readOnly}
                          className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                        />
                        Tradable
                      </label>
                    </div>

                    <div className="min-w-0 flex-1 basis-48">
                      <label
                        htmlFor={`instrument-notes-${instrument.id}`}
                        className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
                      >
                        Notes
                      </label>
                      <Input
                        id={`instrument-notes-${instrument.id}`}
                        name="notes"
                        defaultValue={linked?.notes ?? ""}
                        disabled={readOnly}
                        className="mt-1"
                      />
                    </div>

                    {!readOnly ? (
                      <div className="flex gap-2">
                        <SubmitButton size="sm" pendingLabel="Staging…">
                          {linked ? "Update" : "Link"}
                        </SubmitButton>
                        {linked ? (
                          <button
                            type="submit"
                            name="remove"
                            value="true"
                            className="inline-flex h-8 items-center rounded-[10px] border border-danger/40 bg-danger/12 px-3 text-xs font-medium text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                          >
                            Unlink
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
