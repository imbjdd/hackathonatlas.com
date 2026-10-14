import {
  sqliteTable,
  text,
  real,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

// SQLite (Cloudflare D1) has no uuid/timestamp/array types: ids are uuid
// strings, timestamps are epoch-ms integers, and tags are a JSON array.
const uuid = (name: string) => text(name);
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const doublePrecision = real;

export const events = sqliteTable("events", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  city: text("city"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  organizerId: uuid("organizer_id"),
  link: text("link").unique(),
  cashPrize: integer("cash_prize"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  participantsCount: integer("participants_count").default(0),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  // Attendance mode + location, enriched from the source (Luma) rather than
  // guessed at render time. mode ∈ "online" | "in_person" | "hybrid".
  mode: text("mode"),
  country: text("country"),
  countryCode: text("country_code"),
  venue: text("venue"),
  enrichedAt: timestamp("enriched_at"),
  // LLM fake/test-hackathon classifier. status drives visibility:
  //   pending      — not yet classified (still shown on the site)
  //   kept         — LLM (or an admin) judged it a real hackathon
  //   rejected     — judged fake/test; hidden from the directory
  //   needs_review — LLM was unsure; hidden and queued for /admin review
  // confidence is the LLM's 0–1 self-reported confidence. Policy (see
  // lib/classifier.ts): a "keep" always stays visible; a "remove" hides the
  // event only at high confidence, otherwise it lands in needs_review. model
  // records who decided (e.g. "gpt-5-nano" or "manual").
  classificationStatus: text("classification_status").notNull().default("pending"),
  classificationConfidence: doublePrecision("classification_confidence"),
  classificationReason: text("classification_reason"),
  classificationModel: text("classification_model"),
  classifiedAt: timestamp("classified_at"),
}, (t) => [
  // D1 bills rows read, so the directory's filters must not scan the table.
  index("events_start_time_idx").on(t.startTime),
  index("events_end_time_idx").on(t.endTime),
  index("events_classification_status_idx").on(t.classificationStatus),
]);

export const categories = sqliteTable("categories", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
});

export const eventCategories = sqliteTable(
  "event_categories",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.categoryId] })]
);
