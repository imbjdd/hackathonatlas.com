import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  timestamp,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
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
  tags: text("tags").array(),
  participantsCount: integer("participants_count").default(0),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").defaultNow(),
  // Attendance mode + location, enriched from the source (Luma) rather than
  // guessed at render time. mode ∈ "online" | "in_person" | "hybrid".
  mode: text("mode"),
  country: text("country"),
  countryCode: text("country_code"),
  venue: text("venue"),
  enrichedAt: timestamp("enriched_at"),
});

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const eventCategories = pgTable(
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
