/**
 * Script to generate embeddings for whiskies that don't have them
 * Can be run independently of the scraper
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import * as cliProgress from "cli-progress";
import { and, sql } from "drizzle-orm";

import { db } from "@acme/db/client";
import { whisky } from "@acme/db/schema";

import { getOrGenerateEmbedding } from "../embedding-utils";

/**
 * Extract label from HTML file if it exists
 * Uses the same JSON extraction logic as the scraper
 */
async function extractLabelFromHtml(
  rawDataDir: string,
  whiskyId: number,
): Promise<string | null> {
  try {
    const filePath = join(rawDataDir, `${whiskyId}.html`);
    const html = await fs.readFile(filePath, "utf-8");

    // Extract JSON data from Vue component attribute (same logic as scraper)
    const whiskyAttrStart = html.indexOf(':whisky="');
    const bottleAttrStart = html.indexOf(':bottle="');

    if (whiskyAttrStart === -1 && bottleAttrStart === -1) {
      return null;
    }

    const attrStart =
      whiskyAttrStart !== -1 ? whiskyAttrStart : bottleAttrStart;
    const valueStart = attrStart + 9; // length of ':whisky="' or ':bottle="'

    const nextAttr = html.indexOf(' current="', valueStart);
    const nextGt = html.indexOf(">", valueStart);
    const searchEnd =
      nextAttr !== -1 && nextGt !== -1
        ? Math.min(nextAttr, nextGt)
        : nextAttr !== -1
          ? nextAttr
          : nextGt !== -1
            ? nextGt
            : html.length;

    // Find closing quote after JSON
    let valueEnd = -1;
    for (let i = searchEnd - 1; i >= valueStart + 1; i--) {
      if (html[i] === '"') {
        const before = html.substring(Math.max(0, i - 6), i);
        if (before !== "&quot;" && !before.endsWith("&quot")) {
          if (i > 0 && html[i - 1] === "}") {
            valueEnd = i;
            break;
          }
        }
      }
    }

    if (valueEnd === -1) {
      // Fallback: find last " before searchEnd
      for (let i = searchEnd - 1; i >= valueStart; i--) {
        if (html[i] === '"') {
          const before = html.substring(Math.max(0, i - 6), i);
          if (before !== "&quot;" && !before.endsWith("&quot")) {
            valueEnd = i;
            break;
          }
        }
      }
    }

    if (valueEnd === -1) {
      return null;
    }

    const jsonStrEscaped = html.substring(valueStart, valueEnd);
    const jsonStr = jsonStrEscaped
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

    const jsonData = JSON.parse(jsonStr) as Record<string, unknown>;
    const label =
      typeof jsonData.label === "string" && jsonData.label
        ? jsonData.label
        : null;

    return label;
  } catch {
    return null;
  }
}

interface GenerateEmbeddingsOptions {
  batchSize?: number;
  limit?: number; // Limit number of whiskies to process (for testing)
  startId?: number; // Start from a specific whisky ID
  dryRun?: boolean; // Don't actually update the database
}

async function generateEmbeddingsForWhiskies(
  options: GenerateEmbeddingsOptions = {},
): Promise<void> {
  const { batchSize = 25, limit, startId, dryRun = false } = options;

  const rawDataDir = "C:/Users/james/Downloads/data/whisky";

  console.log("Finding whiskies without embeddings...");

  // Query whiskies without embeddings
  const whereConditions = [sql`${whisky.embedding} IS NULL`];
  if (startId) {
    whereConditions.push(sql`${whisky.id} >= ${startId}`);
  }

  const query = db
    .select({
      id: whisky.id,
      whiskyId: whisky.whiskyId,
      distillery: whisky.distillery,
      vintage: whisky.vintage,
      statedAge: whisky.statedAge,
      bottlingSeries: whisky.bottlingSeries,
      label: whisky.label,
    })
    .from(whisky)
    .where(and(...whereConditions));

  const whiskiesWithoutEmbeddings = await query;

  const totalCount = limit
    ? Math.min(limit, whiskiesWithoutEmbeddings.length)
    : whiskiesWithoutEmbeddings.length;

  if (totalCount === 0) {
    console.log("No whiskies found without embeddings!");
    return;
  }

  console.log(
    `Found ${whiskiesWithoutEmbeddings.length} whiskies without embeddings`,
  );
  if (limit) {
    console.log(`Processing ${totalCount} whiskies (limited)`);
  }

  // Create progress bar
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Embeddings |{bar}| {percentage}% | {value}/{total} whiskies | ETA: {eta}s | Rate: {rate}/s",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  progressBar.start(totalCount, 0);

  let processedCount = 0;
  let successCount = 0;
  let failureCount = 0;

  // Process in batches
  const whiskiesToProcess = whiskiesWithoutEmbeddings.slice(0, totalCount);

  for (let i = 0; i < whiskiesToProcess.length; i += batchSize) {
    const batch = whiskiesToProcess.slice(i, i + batchSize);

    // Generate embeddings for batch
    const embeddingPromises = batch.map(async (w) => {
      try {
        // Use label from database, or extract from HTML if not in DB yet
        const label = w.label ?? (await extractLabelFromHtml(rawDataDir, w.id));

        const embedding = await getOrGenerateEmbedding(rawDataDir, w.id, {
          distillery: w.distillery,
          vintage: w.vintage,
          statedAge: w.statedAge,
          bottlingSeries: w.bottlingSeries,
          label,
        });

        if (embedding) {
          return { id: w.id, embedding, success: true };
        } else {
          return { id: w.id, embedding: null, success: false };
        }
      } catch (error) {
        console.error(
          `Failed to generate embedding for whisky ${w.id}:`,
          error,
        );
        return { id: w.id, embedding: null, success: false };
      }
    });

    const results = await Promise.all(embeddingPromises);

    // Update database with embeddings
    if (!dryRun) {
      for (const result of results) {
        if (result.embedding) {
          try {
            await db
              .update(whisky)
              .set({
                embedding: result.embedding,
                updatedAt: new Date(),
              })
              .where(sql`${whisky.id} = ${result.id}`);
            successCount++;
          } catch (error) {
            console.error(
              `Failed to update database for whisky ${result.id}:`,
              error,
            );
            failureCount++;
          }
        } else {
          failureCount++;
        }
      }
    } else {
      // Dry run - just count
      results.forEach((r) => {
        if (r.embedding) {
          successCount++;
        } else {
          failureCount++;
        }
      });
    }

    processedCount += batch.length;
    progressBar.update(processedCount);
  }

  progressBar.stop();

  console.log("\n=== Embedding Generation Summary ===");
  console.log(`Total processed: ${processedCount}`);
  console.log(`Successfully generated: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
  if (dryRun) {
    console.log("\n(DRY RUN - No database updates were made)");
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const options: GenerateEmbeddingsOptions = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--batch-size" && nextArg) {
      options.batchSize = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--limit" && nextArg) {
      options.limit = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--start-id" && nextArg) {
      options.startId = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: pnpm generate-embeddings [options]

Options:
  --batch-size <number>  Number of whiskies to process in parallel (default: 25)
  --limit <number>      Limit number of whiskies to process (for testing)
  --start-id <number>   Start from a specific whisky ID
  --dry-run            Don't update the database, just show what would be done
  --help, -h           Show this help message

Examples:
  pnpm generate-embeddings
  pnpm generate-embeddings --limit 100
  pnpm generate-embeddings --start-id 1000 --batch-size 50
  pnpm generate-embeddings --dry-run
      `);
      process.exit(0);
    }
  }

  try {
    await generateEmbeddingsForWhiskies(options);
    process.exit(0);
  } catch (error) {
    console.error("Error generating embeddings:", error);
    process.exit(1);
  }
}

void main();
