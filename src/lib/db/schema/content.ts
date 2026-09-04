import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, softDeleteTimestamps } from "./columns";
import { propFirms } from "./firms";

/**
 * FIRM-AUTHORED CONTENT — announcements and FAQs.
 *
 * Both are ordinary firm children: they live in the draft like challenges do,
 * are materialised at publish, and appear publicly only when a row exists. An
 * empty section is never rendered, and neither table is ever seeded — every row
 * is something an admin transcribed from the firm (docs/CLAUDE.md §3).
 *
 * Deliberately NOT a news or social system. An announcement is a title, a date,
 * some text and an optional link — no threading, no reactions, no feed.
 */

/**
 * Something the firm announced: a rule change, a new platform, an outage.
 *
 * `announcedAt` is the firm's date, not ours, which is why it is required: an
 * announcement whose date nobody recorded cannot be placed in time, and
 * defaulting it to the row's creation time would silently invent one.
 */
export const firmAnnouncements = pgTable(
  "firm_announcements",
  {
    id: primaryId(),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    /** The firm's source for it — its own post, changelog or notice. */
    linkUrl: text("link_url"),
    announcedAt: timestamp("announced_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    ...softDeleteTimestamps(),
  },
  (t) => [
    index("firm_announcements_firm_idx").on(t.propFirmId, t.announcedAt.desc()),
    index("firm_announcements_live_idx")
      .on(t.propFirmId, t.announcedAt.desc())
      .where(sql`${t.isActive} and ${t.deletedAt} is null`),
    check(
      "firm_announcements_title_ck",
      sql`length(${t.title}) between 1 and 200`,
    ),
    check(
      "firm_announcements_link_ck",
      sql`${t.linkUrl} is null or ${t.linkUrl} like 'https://%'`,
    ),
  ],
);

/**
 * A question the firm actually answers, and its answer.
 *
 * Both columns are required: a question with no answer is not an FAQ, and it
 * would render as a heading with nothing under it. FAQ content is eligible for
 * `FAQPage` structured data ONLY because it is real, admin-entered text that is
 * visible on the page (docs/SEO.md §11).
 */
export const firmFaqs = pgTable(
  "firm_faqs",
  {
    id: primaryId(),
    propFirmId: uuid("prop_firm_id")
      .notNull()
      .references(() => propFirms.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    ...softDeleteTimestamps(),
  },
  (t) => [
    index("firm_faqs_firm_idx").on(t.propFirmId, t.displayOrder),
    index("firm_faqs_live_idx")
      .on(t.propFirmId, t.displayOrder)
      .where(sql`${t.isActive} and ${t.deletedAt} is null`),
    check(
      "firm_faqs_question_ck",
      sql`length(${t.question}) between 1 and 300`,
    ),
    check("firm_faqs_answer_ck", sql`length(${t.answer}) between 1 and 5000`),
  ],
);
