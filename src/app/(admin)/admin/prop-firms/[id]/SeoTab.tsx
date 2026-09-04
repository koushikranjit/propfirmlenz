"use client";

import { useActionState } from "react";
import {
  type ActionResult,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Card, Field, Input, Textarea } from "@/components/ui/primitives";
import type { AdminSeoMetadata } from "@/lib/repositories/admin-firm-children";
import { saveSeoAction } from "@/lib/services/firm-child-actions";

/**
 * SEO overrides — docs/SEO.md §5.1, §10.3, §11 `[LOCKED]`.
 *
 * These fields OVERRIDE the deterministic template. Leaving one blank is the
 * normal case: the template already builds a title and description from what
 * the firm has actually published, and branches when a value is missing.
 *
 * THREE THINGS AN ADMIN CANNOT DO HERE, deliberately:
 *
 *  1. Make a thin page indexable. `isIndexable()` decides that from the
 *     published content, and it stays authoritative — ticking "allow indexing"
 *     on a profile with no description and no data changes nothing (§10.3).
 *  2. Inject structured data. There is no `structured_data_override` field,
 *     because an admin-supplied JSON-LD blob would need schema validation
 *     before render and that validator does not exist (§11 rule 4).
 *  3. Create rating, review or FAQ markup. None of it is emitted anywhere, at
 *     any setting, before the data genuinely exists (§11 rule 1).
 */
export function SeoTab({
  firmId,
  seo,
  slug,
  hasStagedSeo,
  readOnly,
  canWriteSeo,
}: {
  firmId: string;
  seo: AdminSeoMetadata | null;
  slug: string;
  hasStagedSeo: boolean;
  readOnly: boolean;
  canWriteSeo: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    saveSeoAction,
    {},
  );

  if (!canWriteSeo) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-muted">
          You do not have permission to edit SEO metadata.
        </p>
      </Card>
    );
  }

  const err = (field: string) => state.fieldErrors?.[field];
  const locked = readOnly;

  return (
    <div className="flex flex-col gap-4">
      <StatusMessage state={state} />

      {hasStagedSeo ? (
        <p className="rounded-[10px] border border-warning/40 bg-warning/12 px-3 py-2 text-sm text-warning">
          SEO changes are staged and take effect when you publish.
        </p>
      ) : null}

      <Card className="p-4">
        <p className="text-sm text-text-muted">
          Public URL:{" "}
          <code className="text-text-secondary">/prop-firms/{slug}</code>. Leave
          a field blank to use the deterministic template, which is generated
          from what the firm has actually published.
        </p>
      </Card>

      <form action={formAction}>
        <input type="hidden" name="firmId" value={firmId} />

        <Card className="grid gap-5 p-6 md:grid-cols-2">
          <Field
            label="Title override"
            htmlFor="title"
            hint="Max 70 characters. Blank uses the template."
            error={err("title")}
          >
            <Input
              name="title"
              maxLength={70}
              defaultValue={seo?.title ?? ""}
              disabled={locked}
            />
          </Field>
          <Field
            label="Canonical URL override"
            htmlFor="canonicalUrl"
            hint="Only for genuine cross-URL duplication. Normally blank."
            error={err("canonicalUrl")}
          >
            <Input
              name="canonicalUrl"
              type="url"
              placeholder="https://"
              defaultValue={seo?.canonicalUrl ?? ""}
              disabled={locked}
            />
          </Field>

          <div className="md:col-span-2">
            <Field
              label="Meta description override"
              htmlFor="metaDescription"
              hint="Max 160 characters."
              error={err("metaDescription")}
            >
              <Textarea
                name="metaDescription"
                rows={2}
                maxLength={160}
                defaultValue={seo?.metaDescription ?? ""}
                disabled={locked}
              />
            </Field>
          </div>

          <Field
            label="Open Graph title"
            htmlFor="ogTitle"
            error={err("ogTitle")}
          >
            <Input
              name="ogTitle"
              maxLength={70}
              defaultValue={seo?.ogTitle ?? ""}
              disabled={locked}
            />
          </Field>
          <Field
            label="Open Graph description"
            htmlFor="ogDescription"
            error={err("ogDescription")}
          >
            <Input
              name="ogDescription"
              maxLength={200}
              defaultValue={seo?.ogDescription ?? ""}
              disabled={locked}
            />
          </Field>

          <div className="flex flex-col gap-3 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                name="robotsIndex"
                defaultChecked={seo?.robotsIndex ?? true}
                disabled={locked}
                className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              />
              Allow indexing
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                name="robotsFollow"
                defaultChecked={seo?.robotsFollow ?? true}
                disabled={locked}
                className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              />
              Allow following links
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                name="includeInSitemap"
                defaultChecked={seo?.includeInSitemap ?? true}
                disabled={locked}
                className="size-4 rounded border-border-default bg-bg-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              />
              Include in the sitemap
            </label>

            <p className="text-xs text-text-muted">
              Unticking &ldquo;allow indexing&rdquo; makes the page{" "}
              <code>noindex</code>. Ticking it does not force indexing: a
              profile without enough published substance is still shipped{" "}
              <code>noindex</code> and kept out of the sitemap, so the two can
              never disagree.
            </p>
          </div>

          {!locked ? (
            <div className="md:col-span-2">
              <SubmitButton variant="primary" pendingLabel="Staging…">
                Stage SEO changes
              </SubmitButton>
            </div>
          ) : null}
        </Card>
      </form>
    </div>
  );
}
