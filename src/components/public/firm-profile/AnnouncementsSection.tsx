import { formatDate } from "@/lib/view/format";
import type {
  FirmViewAnnouncement,
  FirmViewFaq,
} from "@/lib/view/firm-view";

/**
 * Announcements and FAQs — docs/PROJECT.md §6.5.
 *
 * Both render ONLY when the firm has real entries. The caller omits the whole
 * section otherwise: an empty "Announcements" heading implies a firm that
 * announces nothing, which is a claim we have no basis for (CLAUDE.md §3).
 */

export function AnnouncementsSection({
  announcements,
}: {
  announcements: FirmViewAnnouncement[];
}) {
  return (
    <ol className="flex flex-col gap-3">
      {announcements.map((announcement) => (
        <li
          key={announcement.id}
          className="rounded-[14px] border border-border-default bg-bg-card p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {announcement.title}
            </h3>
            {/* The FIRM's date, transcribed — never the row's creation time. */}
            <time
              dateTime={announcement.announcedAt}
              className="text-xs text-text-muted"
            >
              {formatDate(announcement.announcedAt)}
            </time>
          </div>

          {announcement.body ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
              {announcement.body}
            </p>
          ) : null}

          {announcement.linkUrl ? (
            <p className="mt-2 text-sm">
              <a
                href={announcement.linkUrl}
                rel="nofollow noopener"
                target="_blank"
                className="rounded text-brand-cyan underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                Read the firm&apos;s announcement
              </a>
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * FAQs as a definition list.
 *
 * `<details>` would hide the answers from a reader who wants to scan them, and
 * hidden text is weaker for search too. Every answer is visible.
 */
export function FaqSection({ faqs }: { faqs: FirmViewFaq[] }) {
  return (
    <dl className="flex flex-col gap-5">
      {faqs.map((faq) => (
        <div key={faq.id}>
          <dt className="text-sm font-semibold text-text-primary">
            {faq.question}
          </dt>
          <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
            {faq.answer}
          </dd>
        </div>
      ))}
    </dl>
  );
}
