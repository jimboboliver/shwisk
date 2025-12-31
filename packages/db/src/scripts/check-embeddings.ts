/**
 * Script to check how many whisky records have vector embeddings
 */

import { sql } from "drizzle-orm";

import { db } from "../client";
import { whisky } from "../whisky-schema";

async function checkEmbeddings() {
  try {
    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(whisky);

    const total = Number(totalResult[0]?.count ?? 0);

    // Get count with embeddings
    const withEmbeddingsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(whisky)
      .where(sql`${whisky.embedding} IS NOT NULL`);

    const withEmbeddings = Number(withEmbeddingsResult[0]?.count ?? 0);

    // Get count without embeddings
    const withoutEmbeddings = total - withEmbeddings;

    // Calculate percentage
    const percentage =
      total > 0 ? ((withEmbeddings / total) * 100).toFixed(2) : "0.00";

    console.log("\n=== Whisky Embedding Statistics ===\n");
    console.log(`Total whisky records: ${total.toLocaleString()}`);
    console.log(
      `Records with embeddings: ${withEmbeddings.toLocaleString()} (${percentage}%)`,
    );
    console.log(
      `Records without embeddings: ${withoutEmbeddings.toLocaleString()} (${(100 - parseFloat(percentage)).toFixed(2)}%)`,
    );
    console.log("\n");

    // Get some sample records with and without embeddings
    if (withEmbeddings > 0) {
      const sampleWith = await db
        .select({
          id: whisky.id,
          whiskyId: whisky.whiskyId,
          name: whisky.name,
        })
        .from(whisky)
        .where(sql`${whisky.embedding} IS NOT NULL`)
        .limit(5);

      console.log("Sample records WITH embeddings:");
      sampleWith.forEach((w) => {
        console.log(`  - ${w.whiskyId}: ${w.name}`);
      });
      console.log("\n");
    }

    if (withoutEmbeddings > 0) {
      const sampleWithout = await db
        .select({
          id: whisky.id,
          whiskyId: whisky.whiskyId,
          name: whisky.name,
        })
        .from(whisky)
        .where(sql`${whisky.embedding} IS NULL`)
        .limit(5);

      console.log("Sample records WITHOUT embeddings:");
      sampleWithout.forEach((w) => {
        console.log(`  - ${w.whiskyId}: ${w.name}`);
      });
      console.log("\n");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error checking embeddings:", error);
    process.exit(1);
  }
}

void checkEmbeddings();
