"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type ActionState,
  createFirmAction,
} from "@/lib/services/firm-actions";
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";

/** Mirrors the server slug rule; the server remains authoritative. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Creating…" : "Create draft"}
    </Button>
  );
}

export function CreateFirmForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createFirmAction,
    {},
  );
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <form action={formAction}>
      <Card className="flex flex-col gap-5 p-6">
        {state.error ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-[10px] border border-danger/40 bg-danger/12 px-3 py-2 text-sm font-medium text-danger"
          >
            {state.error}
          </p>
        ) : null}

        <Field
          label="Firm name"
          htmlFor="name"
          required
          error={state.fieldErrors?.name}
        >
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
            aria-describedby={
              state.fieldErrors?.name ? "name-error" : undefined
            }
          />
        </Field>

        <Field
          label="Slug"
          htmlFor="slug"
          required
          hint="Used in the public URL: /prop-firms/{slug}. Lowercase, hyphenated."
          error={state.fieldErrors?.slug}
        >
          <Input
            id="slug"
            name="slug"
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            aria-invalid={state.fieldErrors?.slug ? true : undefined}
            aria-describedby={
              state.fieldErrors?.slug ? "slug-error" : "slug-hint"
            }
          />
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          hint="Optional now, but required before publishing. Leave blank if you have not researched it yet — do not guess."
          error={state.fieldErrors?.description}
        >
          <Textarea id="description" name="description" rows={5} />
        </Field>

        <p className="text-xs text-text-metadata">
          Everything else — country, website, founding year, branding — is left
          unset and shown as &ldquo;Not specified&rdquo; until a human enters
          it.
        </p>

        <div className="flex gap-2">
          <Submit />
        </div>
      </Card>
    </form>
  );
}
