"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/primitives";
import {
  type ActionState,
  removeLogoAction,
  uploadLogoAction,
} from "@/lib/services/firm-content-actions";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/media/image";

/**
 * Logo upload — docs/ADMIN.md §14.
 *
 * Upload, preview, replace, remove, in the PRIMARY editor. The preview is a
 * local object URL so the admin sees the file before it leaves the browser;
 * the SERVER decides whether it is acceptable, by reading the bytes.
 *
 * THE UPLOAD IS STAGED, NOT PUBLISHED `[LOCKED]`. The object and its media row
 * are created immediately — an upload is not undone by a discard — but
 * `logo_media_id` goes into `draft_payload`. The public page keeps the
 * published logo until someone publishes (CLAUDE.md §12.4e rule 28).
 *
 * WHEN STORAGE IS NOT CONFIGURED the control is replaced by a message naming
 * the variables that are missing — names only, never values (CLAUDE.md §6).
 * The rest of the editor keeps working; a firm needs only a name to save.
 */

export interface StorageState {
  configured: boolean;
  /** Variable NAMES that are unset. Never their values. */
  missing: string[];
}

/** Announces upload progress. `useFormStatus` cannot be read by the parent. */
function UploadButton({
  disabled,
  replacing,
}: {
  disabled: boolean;
  replacing: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" disabled={pending || disabled}>
        {pending
          ? "Uploading logo…"
          : replacing
            ? "Replace logo"
            : "Upload logo"}
      </Button>
      {/* Progress reaches assistive tech, not just sighted users. */}
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? "Uploading logo, please wait" : ""}
      </span>
    </>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? "Removing…" : "Remove logo"}
    </Button>
  );
}

/**
 * Outcome of the last action.
 *
 * Text carries the meaning; colour only reinforces it, so the state is legible
 * without colour perception (docs/DESIGN.md §2.5 rule 5).
 */
function Outcome({ state }: { state: ActionState }) {
  if (!state.error && !state.message) return null;
  const failed = Boolean(state.error);
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        "rounded-[10px] border px-3 py-2 text-sm font-medium " +
        (failed
          ? "border-danger/40 bg-danger/12 text-danger"
          : "border-success/40 bg-success/12 text-success")
      }
    >
      <span className="font-semibold">
        {failed ? "Logo upload failed: " : "Logo uploaded: "}
      </span>
      {state.error ?? state.message}
    </p>
  );
}

export function LogoUpload({
  firmId,
  logoUrl,
  logoAlt,
  readOnly,
  storage,
}: {
  firmId: string;
  logoUrl: string | null;
  logoAlt: string | null;
  readOnly: boolean;
  storage: StorageState;
}) {
  const [uploadState, upload] = useActionState<ActionState, FormData>(
    uploadLogoAction,
    {},
  );
  const [removeState, remove] = useActionState<ActionState, FormData>(
    removeLogoAction,
    {},
  );
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [clientError, setClientError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Revoked on replacement and unmount; leaving it allocated pins the whole
  // file in memory for as long as the page is open.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const current = uploadState.logoUrl ?? logoUrl;

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setFileName(null);
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setClientError(null);

    // A courtesy check only. The server re-reads the bytes and is what
    // actually decides — this just saves a pointless round trip.
    if (file && file.size > MAX_IMAGE_BYTES) {
      setClientError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${Math.round(
          MAX_IMAGE_BYTES / 1024 / 1024,
        )}MB.`,
      );
      clear();
      return;
    }

    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
    setFileName(file?.name ?? null);
  }

  if (!storage.configured) {
    return (
      <div className="flex flex-col gap-3">
        {current ? <LogoPreview src={current} alt={logoAlt} /> : <NoLogo />}
        <p className="rounded-[10px] border border-dashed border-warning/40 bg-warning/12 px-4 py-3 text-sm text-warning">
          <span className="font-semibold">
            Logo upload is unavailable until storage is configured.
          </span>{" "}
          Everything else in this editor works normally.
          {storage.missing.length > 0 ? (
            <>
              {" "}
              Missing on the server:{" "}
              {/* Names only. The values never leave the server. */}
              <code className="font-mono">{storage.missing.join(", ")}</code>.
            </>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Outcome state={uploadState} />
      <Outcome state={removeState} />
      {clientError ? (
        <p
          role="alert"
          className="rounded-[10px] border border-danger/40 bg-danger/12 px-3 py-2 text-sm font-medium text-danger"
        >
          <span className="font-semibold">Logo upload failed: </span>
          {clientError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        {preview ? (
          <LogoPreview src={preview} alt="Selected logo, not yet uploaded" />
        ) : current ? (
          <LogoPreview src={current} alt={logoAlt} />
        ) : (
          <NoLogo />
        )}

        {readOnly ? (
          <p className="text-sm text-text-muted">
            You have read-only access to this firm.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <form action={upload} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="firmId" value={firmId} />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="logo"
                  className="text-xs font-semibold uppercase tracking-wide text-text-secondary"
                >
                  Choose a logo file
                </label>
                <input
                  ref={inputRef}
                  id="logo"
                  name="logo"
                  type="file"
                  accept={ALLOWED_IMAGE_TYPES.join(",")}
                  onChange={onPick}
                  aria-describedby="logo-hint"
                  className="block w-full max-w-xs rounded-[8px] text-sm text-text-secondary file:mr-3 file:rounded-[8px] file:border file:border-border-default file:bg-bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-text-primary hover:file:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
                />
              </div>

              <UploadButton disabled={!fileName} replacing={Boolean(current)} />
            </form>

            <p id="logo-hint" className="text-xs text-text-muted">
              PNG, JPEG or WebP, up to{" "}
              {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB. SVG is not
              accepted. The upload is staged — the published page keeps the
              current logo until you publish.
            </p>

            {fileName ? (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>Selected: {fileName}</span>
                <Button size="sm" variant="ghost" onClick={clear}>
                  Clear
                </Button>
              </div>
            ) : null}

            {current ? (
              <form action={remove}>
                <input type="hidden" name="firmId" value={firmId} />
                <RemoveButton />
              </form>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function NoLogo() {
  return (
    <div className="flex size-20 items-center justify-center rounded-[12px] border border-dashed border-border-default text-xs text-text-muted">
      No logo
    </div>
  );
}

function LogoPreview({ src, alt }: { src: string; alt: string | null }) {
  return (
    /* An admin preview of an arbitrary remote or blob: URL — next/image
       cannot handle blob:, and this is a fixed 80px thumbnail behind auth.
       `object-contain` keeps the aspect ratio; the checkered ground makes a
       transparent PNG or WebP legible rather than invisible. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? "Firm logo"}
      width={80}
      height={80}
      className="size-20 rounded-[12px] border border-border-default bg-bg-elevated object-contain p-1"
    />
  );
}
