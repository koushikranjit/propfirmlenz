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

/**
 * ADD PROP FIRM — the fast path.
 *
 * A name and a short description, and the firm exists. Everything else the
 * schema holds — company details, challenges, rules, platforms, instruments,
 * offers, affiliate links, SEO — is entered afterwards in the workspace, where
 * the simple fields sit on top and the structured data lives under Advanced.
 *
 * NO SLUG FIELD. It is derived from the name on the server and stays editable
 * under Advanced: one less thing to think about while adding a firm, and a
 * later rename still leaves a 301 behind (docs/SEO.md §7).
 */

/** Mirrors the server rule so the preview matches; the server is authoritative. */
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
      {pending ? "Creating…" : "Create firm"}
    </Button>
  );
}

export function CreateFirmForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createFirmAction,
    {},
  );
  const [name, setName] = React.useState("");
  const slug = slugify(name);

  return (
    <form action={formAction}>
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
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
          label="Prop firm name"
          htmlFor="name"
          required
          error={state.fieldErrors?.name ?? state.fieldErrors?.slug}
        >
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={state.fieldErrors?.name ? true : undefined}
          />
        </Field>

        {slug ? (
          <p className="-mt-2 text-xs text-text-muted">
            Public URL will be{" "}
            <code className="text-text-secondary">/prop-firms/{slug}</code>.
            Editable later under Advanced.
          </p>
        ) : null}

        <Field
          label="Short description"
          htmlFor="description"
          hint="Optional now, required before publishing. Leave blank rather than guessing."
          error={state.fieldErrors?.description}
        >
          <Textarea id="description" name="description" rows={4} />
        </Field>

        <p className="text-xs text-text-muted">
          The next screen has the website, purchase link, discount and payout
          link. Everything else stays optional and shows as &ldquo;Not
          specified&rdquo; until a human enters it.
        </p>

        <div>
          <Submit />
        </div>
      </Card>
    </form>
  );
}
