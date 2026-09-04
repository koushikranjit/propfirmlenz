"use client";

import * as React from "react";
import { useActionState } from "react";
import { StatusMessage, SubmitButton } from "@/components/admin/forms";
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
 * Upload, preview, replace, remove. The preview is a local object URL so the
 * admin sees the file before it leaves the browser; the SERVER is what decides
 * whether it is acceptable, by reading the bytes.
 *
 * WHEN STORAGE IS NOT CONFIGURED the control is disabled and says so, naming
 * what is missing. A file input that cannot store anything is worse than an
 * honest message — it wastes the upload and loses the file.
 */
export function LogoUpload({
  firmId,
  logoUrl,
  logoAlt,
  readOnly,
  storageConfigured,
}: {
  firmId: string;
  logoUrl: string | null;
  logoAlt: string | null;
  readOnly: boolean;
  storageConfigured: boolean;
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
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The object URL is revoked on replacement and unmount; leaving it allocated
  // pins the whole file in memory for as long as the page is open.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const current = uploadState.logoUrl ?? logoUrl;

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
    setFileName(file?.name ?? null);
  }

  if (!storageConfigured) {
    return (
      <div className="flex flex-col gap-3">
        {current ? <LogoPreview src={current} alt={logoAlt} /> : null}
        <p className="rounded-[10px] border border-dashed border-border-default px-4 py-3 text-sm text-text-muted">
          Media storage is not configured on this server, so a logo cannot be
          uploaded yet. Once the R2 credentials are set, this becomes an upload
          field — nothing else changes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusMessage state={uploadState} />
      <StatusMessage state={removeState} />

      <div className="flex flex-wrap items-start gap-4">
        {preview ? (
          <LogoPreview src={preview} alt="Selected logo, not yet uploaded" />
        ) : current ? (
          <LogoPreview src={current} alt={logoAlt} />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-[12px] border border-dashed border-border-default text-xs text-text-muted">
            No logo
          </div>
        )}

        {!readOnly ? (
          <div className="flex flex-col gap-2">
            <form action={upload} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="firmId" value={firmId} />
              <input
                ref={inputRef}
                id="logo"
                name="logo"
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                onChange={onPick}
                className="block w-full max-w-xs text-sm text-text-secondary file:mr-3 file:rounded-[8px] file:border file:border-border-default file:bg-bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-text-primary hover:file:border-border-strong"
              />
              <SubmitButton pendingLabel="Uploading…" disabled={!fileName}>
                {current ? "Replace logo" : "Upload logo"}
              </SubmitButton>
            </form>

            <p className="text-xs text-text-muted">
              PNG, JPEG or WebP, up to{" "}
              {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB. SVG is not
              accepted. The upload is staged — the published page keeps the
              current logo until you publish.
            </p>

            {current ? (
              <form action={remove}>
                <input type="hidden" name="firmId" value={firmId} />
                <SubmitButton
                  variant="danger"
                  size="sm"
                  pendingLabel="Removing…"
                >
                  Remove logo
                </SubmitButton>
              </form>
            ) : null}

            {fileName ? (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span>{fileName}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (inputRef.current) inputRef.current.value = "";
                    setPreview((old) => {
                      if (old) URL.revokeObjectURL(old);
                      return null;
                    });
                    setFileName(null);
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LogoPreview({ src, alt }: { src: string; alt: string | null }) {
  return (
    /* An admin preview of an arbitrary remote or blob: URL — next/image
       cannot handle blob:, and this is a fixed 80px thumbnail behind auth. */
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
