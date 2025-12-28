import { sql } from "drizzle-orm";
import { customType, pgTable } from "drizzle-orm/pg-core";

// Custom vector type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)", // OpenAI embeddings are 1536 dimensions
  toDriver: (value: number[]) => JSON.stringify(value),
  fromDriver: (value: string) => JSON.parse(value) as number[],
});

export const whisky = pgTable("whisky", (t) => ({
  id: t.integer().notNull().primaryKey(),
  whiskyId: t.text().notNull().unique(), // e.g., "WB1"
  name: t.text().notNull(),
  category: t.text(), // e.g., "Single Malt"
  distillery: t.text(),
  bottler: t.text(),
  bottlingSeries: t.text(),
  vintage: t.text(), // e.g., "90s", "2007"
  bottledDate: t.text(), // e.g., "2007 - 2025"
  statedAge: t.text(), // e.g., "12 years old"
  caskType: t.text(),
  strength: t.text(), // e.g., "40.00" (%vol) - stored as text for precision
  size: t.text(), // e.g., "700ml"
  barcode: t.text(),
  whiskyGroupId: t.integer(), // Reference to whisky group
  // Flags
  uncolored: t.boolean(),
  nonChillfiltered: t.boolean(),
  caskStrength: t.boolean(),
  // Metadata
  numberOfBottles: t.integer(),
  imageUrl: t.text(),
  // Vector embedding for semantic search (e.g., OpenAI embeddings)
  // This will be generated from the whisky name + description fields
  embedding: vector("embedding"),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const whiskyPricing = pgTable("whisky_pricing", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  whiskyId: t
    .integer()
    .notNull()
    .references(() => whisky.id, { onDelete: "cascade" }),
  marketValue: t.text(), // Market value amount - stored as text for precision
  marketValueCurrency: t.text().default("EUR"), // Currency code
  marketValueDate: t.timestamp(), // Date of market value
  retailPrice: t.text(), // Retail price amount - stored as text for precision
  retailPriceCurrency: t.text().default("EUR"), // Currency code
  retailPriceDate: t.timestamp(), // Date of retail price
  createdAt: t.timestamp().defaultNow().notNull(),
}));

export const whiskyRating = pgTable("whisky_rating", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  whiskyId: t
    .integer()
    .notNull()
    .references(() => whisky.id, { onDelete: "cascade" }),
  averageRating: t.text(), // Average rating score (0-100) - stored as text for precision
  numberOfRatings: t.integer(), // Total number of ratings
  scrapedAt: t.timestamp().defaultNow().notNull(),
}));

export const whiskyScrapingProgress = pgTable(
  "whisky_scraping_progress",
  (t) => ({
    id: t.integer().notNull().primaryKey().default(1), // Single row table
    lastProcessedId: t.integer().notNull().default(0), // Last successfully processed whisky ID
    status: t.text().notNull().default("idle"), // idle, running, completed, error
    startedAt: t.timestamp(),
    completedAt: t.timestamp(),
    errorMessage: t.text(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
);
