"use client";

import { useActionState } from "react";
import {
  EditorDisclosure,
  PendingBadge,
  StatusMessage,
  SubmitButton,
} from "@/components/admin/forms";
import { Card, Field, Input, Textarea } from "@/components/ui/primitives";
import {
  type ActionState,
  deleteAnnouncementAction,
  deleteFaqAction,
  saveAnnouncementAction,
  saveFaqAction,
} from "@/lib/services/firm-content-actions";
import type {
  AdminAnnouncement,
  AdminFaq,
} from "@/lib/repositories/admin-firm-children";

/**
 * Announcements and FAQ editors — docs/ADMIN.md §6.
 *
 * Both stage into the draft like every other child, so an edit is previewable
 * and nothing reaches the public page until publish. Neither is prefilled with
 * example content: an invented FAQ is invented business data (CLAUDE.md §3).
 */

/** ISO -> `datetime-local`, in UTC. */
const toLocal = (iso: string | null): string => (iso ? iso.slice(0, 16) : "");

interface Staged {
  /** Ids (or natural keys) with a pending op, so a row can say so. */
  staged: Set<string>;
}

/* --------------------------------------------------------- announcements */

function AnnouncementForm({
  firmId,
  announcement,
  readOnly,
}: {
  firmId: string;
  announcement?: AdminAnnouncement;
  readOnly: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveAnnouncementAction,
    {},
  );
  const id = announcement?.id ?? "new";
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="firmId" value={firmId} />
      {announcement ? (
        <input type="hidden" name="id" value={announcement.id} />
      ) : null}
      <StatusMessage state={state} />

      <Field
        label="Title"
        htmlFor={`a-title-${id}`}
        required
        error={err("title")}
      >
        <Input
          id={`a-title-${id}`}
          name="title"
          required
          defaultValue={announcement?.title ?? ""}
          disabled={readOnly}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Date announced"
          htmlFor={`a-date-${id}`}
          required
          hint="The firm's date for it, in UTC."
          error={err("announcedAt")}
        >
          <Input
            id={`a-date-${id}`}
            name="announcedAt"
            type="datetime-local"
            required
            defaultValue={toLocal(announcement?.announcedAt ?? null)}
            disabled={readOnly}
          />
        </Field>
        <Field
          label="Link"
          htmlFor={`a-link-${id}`}
          hint="The firm's own post or notice. https:// only."
          error={err("linkUrl")}
        >
          <Input
            id={`a-link-${id}`}
            name="linkUrl"
            type="url"
            placeholder="https://"
            defaultValue={announcement?.linkUrl ?? ""}
            disabled={readOnly}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor={`a-body-${id}`} error={err("body")}>
        <Textarea
          id={`a-body-${id}`}
          name="body"
          rows={3}
          defaultValue={announcement?.body ?? ""}
          disabled={readOnly}
        />
      </Field>

      <label
        htmlFor={`a-active-${id}`}
        className="flex items-center gap-2 text-sm text-text-primary"
      >
        <input
          id={`a-active-${id}`}
          name="isActive"
          type="checkbox"
          defaultChecked={announcement?.isActive ?? true}
          disabled={readOnly}
          className="size-4 rounded border-border-default bg-bg-near-black accent-brand-cyan"
        />
        Published — show this on the public page
      </label>

      {!readOnly ? (
        <div>
          <SubmitButton variant="primary" pendingLabel="Saving…">
            {announcement ? "Save announcement" : "Add announcement"}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

function DeleteAnnouncement({ firmId, id }: { firmId: string; id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    deleteAnnouncementAction,
    {},
  );
  return (
    <form action={action} className="mt-4 border-t border-border-subtle pt-4">
      <input type="hidden" name="firmId" value={firmId} />
      <input type="hidden" name="id" value={id} />
      <StatusMessage state={state} />
      <div className="mt-2">
        <SubmitButton variant="danger" size="sm" pendingLabel="Staging…">
          Remove announcement
        </SubmitButton>
      </div>
    </form>
  );
}

export function AnnouncementsSection({
  firmId,
  announcements,
  staged,
  readOnly,
}: {
  firmId: string;
  announcements: AdminAnnouncement[];
  readOnly: boolean;
} & Staged) {
  return (
    <div className="flex flex-col gap-3">
      {announcements.length === 0 ? (
        <p className="text-sm text-text-muted">
          No announcements recorded. Add one only when the firm has actually
          announced something — the public section stays hidden until then.
        </p>
      ) : (
        announcements.map((announcement) => (
          <EditorDisclosure
            key={announcement.id}
            summary={announcement.title}
            meta={
              <>
                {staged.has(announcement.id) ? (
                  <PendingBadge op="update" />
                ) : null}
                <span className="text-xs text-text-muted">
                  {announcement.announcedAt.slice(0, 10)}
                  {announcement.isActive ? "" : " · hidden"}
                </span>
              </>
            }
          >
            <AnnouncementForm
              firmId={firmId}
              announcement={announcement}
              readOnly={readOnly}
            />
            {!readOnly ? (
              <DeleteAnnouncement firmId={firmId} id={announcement.id} />
            ) : null}
          </EditorDisclosure>
        ))
      )}

      {!readOnly ? (
        <EditorDisclosure summary="Add an announcement">
          <AnnouncementForm firmId={firmId} readOnly={readOnly} />
        </EditorDisclosure>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ FAQs */

function FaqForm({
  firmId,
  faq,
  readOnly,
}: {
  firmId: string;
  faq?: AdminFaq;
  readOnly: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    saveFaqAction,
    {},
  );
  const id = faq?.id ?? "new";
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="firmId" value={firmId} />
      {faq ? <input type="hidden" name="id" value={faq.id} /> : null}
      <StatusMessage state={state} />

      <Field
        label="Question"
        htmlFor={`q-${id}`}
        required
        error={err("question")}
      >
        <Input
          id={`q-${id}`}
          name="question"
          required
          defaultValue={faq?.question ?? ""}
          disabled={readOnly}
        />
      </Field>

      <Field
        label="Answer"
        htmlFor={`ans-${id}`}
        required
        hint="Both are required: a question with no answer renders as a heading with nothing under it."
        error={err("answer")}
      >
        <Textarea
          id={`ans-${id}`}
          name="answer"
          rows={4}
          required
          defaultValue={faq?.answer ?? ""}
          disabled={readOnly}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display order" htmlFor={`ord-${id}`}>
          <Input
            id={`ord-${id}`}
            name="displayOrder"
            inputMode="numeric"
            defaultValue={faq?.displayOrder ?? 0}
            disabled={readOnly}
          />
        </Field>
        <label
          htmlFor={`f-active-${id}`}
          className="flex items-center gap-2 self-end text-sm text-text-primary"
        >
          <input
            id={`f-active-${id}`}
            name="isActive"
            type="checkbox"
            defaultChecked={faq?.isActive ?? true}
            disabled={readOnly}
            className="size-4 rounded border-border-default bg-bg-near-black accent-brand-cyan"
          />
          Published
        </label>
      </div>

      {!readOnly ? (
        <div>
          <SubmitButton variant="primary" pendingLabel="Saving…">
            {faq ? "Save FAQ" : "Add FAQ"}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

function DeleteFaq({ firmId, id }: { firmId: string; id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    deleteFaqAction,
    {},
  );
  return (
    <form action={action} className="mt-4 border-t border-border-subtle pt-4">
      <input type="hidden" name="firmId" value={firmId} />
      <input type="hidden" name="id" value={id} />
      <StatusMessage state={state} />
      <div className="mt-2">
        <SubmitButton variant="danger" size="sm" pendingLabel="Staging…">
          Remove FAQ
        </SubmitButton>
      </div>
    </form>
  );
}

export function FaqsSection({
  firmId,
  faqs,
  staged,
  readOnly,
}: {
  firmId: string;
  faqs: AdminFaq[];
  readOnly: boolean;
} & Staged) {
  return (
    <div className="flex flex-col gap-3">
      {faqs.length === 0 ? (
        <p className="text-sm text-text-muted">
          No FAQs recorded. The public FAQ section — and its structured data —
          appear only once there is a real question and answer here.
        </p>
      ) : (
        faqs.map((faq) => (
          <EditorDisclosure
            key={faq.id}
            summary={faq.question}
            meta={
              <>
                {staged.has(faq.id) ? <PendingBadge op="update" /> : null}
                {faq.isActive ? null : (
                  <span className="text-xs text-text-muted">hidden</span>
                )}
              </>
            }
          >
            <FaqForm firmId={firmId} faq={faq} readOnly={readOnly} />
            {!readOnly ? <DeleteFaq firmId={firmId} id={faq.id} /> : null}
          </EditorDisclosure>
        ))
      )}

      {!readOnly ? (
        <EditorDisclosure summary="Add an FAQ">
          <FaqForm firmId={firmId} readOnly={readOnly} />
        </EditorDisclosure>
      ) : null}
    </div>
  );
}

/** Shared empty-state card, so both sections read the same when unused. */
export function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-4 text-sm text-text-muted">
      <p>{children}</p>
    </Card>
  );
}
