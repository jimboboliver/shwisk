import * as cliProgress from "cli-progress";
import { sql } from "drizzle-orm";

import { db } from "@acme/db/client";
import { whisky } from "@acme/db/schema";

import { WhiskyScraper } from "../scraper";

interface ScrapeOptions {
  startId?: number;
  maxId?: number;
  dryRun?: boolean;
  estimatedMaxId?: number; // Estimated maximum ID for progress bar
  findMaxId?: boolean; // If true, find the max ID automatically before scraping
  concurrency?: number; // Number of parallel workers (default: 10, reduced to avoid DB connection limits)
}

interface WhiskyData {
  whisky: {
    id: number;
    whiskyId: string;
    category?: string;
    distillery?: string;
    bottler?: string;
    bottlingSeries?: string;
    vintage?: string;
    bottledDate?: string;
    statedAge?: string;
    caskType?: string;
    strength?: number;
    size?: string;
    barcode?: string;
    whiskyGroupId?: number;
    uncolored?: boolean;
    nonChillfiltered?: boolean;
    caskStrength?: boolean;
    numberOfBottles?: number;
    imageUrl?: string;
    label?: string;
  };
  pricing?: {
    marketValue?: number;
    marketValueCurrency?: string;
    marketValueDate?: Date;
    retailPrice?: number;
    retailPriceCurrency?: string;
    retailPriceDate?: Date;
  };
  rating?: {
    averageRating?: number;
    numberOfRatings?: number;
  };
}

// Batch buffer for database operations
// Uses double-buffering to avoid blocking workers during flush
class BatchBuffer {
  private buffer: WhiskyData[] = [];
  private flushing = false;
  private readonly batchSize: number;
  private readonly rawDataDir: string;
  private flushInterval: NodeJS.Timeout | null = null;
  private flushPromise: Promise<void> | null = null;
  private totalBatchesSaved = 0;
  private totalWhiskiesSaved = 0;

  constructor(
    batchSize = 25,
    rawDataDir = "C:/Users/james/Downloads/data/whisky",
  ) {
    this.batchSize = batchSize;
    this.rawDataDir = rawDataDir;
  }

  add(data: WhiskyData): void {
    // Add to buffer immediately (non-blocking)
    this.buffer.push(data);

    // Trigger flush if batch size reached, but don't wait for it
    if (this.buffer.length >= this.batchSize && !this.flushing) {
      console.log("Flushing batch of", this.buffer.length, "whiskies");
      // Start flush asynchronously, don't await
      this.flush().catch((error) => {
        console.error("Error during batch flush:", error);
        process.exit(1);
      });
    }
  }

  startAutoFlush(intervalMs = 5000): void {
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0 && !this.flushing) {
        this.flush().catch((error) => {
          console.error("Error during auto-flush:", error);
          process.exit(1);
        });
      }
    }, intervalMs);
  }

  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  async flush(): Promise<void> {
    // If already flushing, wait for it to complete
    if (this.flushPromise) {
      await this.flushPromise;
      // After waiting, check if we need to flush again
      if (this.buffer.length >= this.batchSize) {
        return this.flush();
      }
      return;
    }

    if (this.buffer.length === 0) {
      return;
    }

    // Mark as flushing and create promise
    this.flushing = true;
    const batch = [...this.buffer];
    this.buffer = [];

    this.flushPromise = (async () => {
      try {
        await saveWhiskyDataBatch(batch, this.rawDataDir);
        this.totalBatchesSaved++;
        this.totalWhiskiesSaved += batch.length;
        console.log(
          `Total saved: ${this.totalWhiskiesSaved} whiskies in ${this.totalBatchesSaved} batches`,
        );
      } finally {
        this.flushing = false;
        this.flushPromise = null;
      }
    })();

    await this.flushPromise;
  }

  async flushAll(): Promise<void> {
    this.stopAutoFlush();
    // Wait for any in-progress flush
    if (this.flushPromise) {
      try {
        await this.flushPromise;
      } catch (error) {
        // Ignore errors during final flush - data is already in buffer
        console.error("Error during final flush:", error);
      }
    }
    // Flush remaining items in smaller chunks to avoid stack overflow
    while (this.buffer.length > 0) {
      try {
        await this.flush();
      } catch (error) {
        console.error("Error flushing remaining items:", error);
        // Clear buffer to prevent infinite loop
        this.buffer = [];
        break;
      }
    }
  }
}

async function saveWhiskyDataBatch(
  batch: WhiskyData[],
  rawDataDir = "C:/Users/james/Downloads/data/whisky",
): Promise<void> {
  if (batch.length === 0) return;

  // Split large batches into smaller chunks to avoid stack overflow
  const CHUNK_SIZE = 10;
  if (batch.length > CHUNK_SIZE) {
    // Process in chunks
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      await saveWhiskyDataBatch(chunk, rawDataDir);
    }
    return;
  }

  console.log(`Processing batch of ${batch.length} whiskies...`);

  // Batch insert/update whiskies
  // Note: Embeddings are generated separately using generate-embeddings script
  const whiskyValues = batch.map((data) => ({
    id: data.whisky.id,
    whiskyId: data.whisky.whiskyId,
    category: data.whisky.category,
    distillery: data.whisky.distillery,
    bottler: data.whisky.bottler,
    bottlingSeries: data.whisky.bottlingSeries,
    vintage: data.whisky.vintage,
    bottledDate: data.whisky.bottledDate,
    statedAge: data.whisky.statedAge,
    caskType: data.whisky.caskType,
    strength: data.whisky.strength?.toString(),
    size: data.whisky.size,
    barcode: data.whisky.barcode,
    whiskyGroupId: data.whisky.whiskyGroupId,
    label: data.whisky.label,
    uncolored: data.whisky.uncolored,
    nonChillfiltered: data.whisky.nonChillfiltered,
    caskStrength: data.whisky.caskStrength,
    numberOfBottles: data.whisky.numberOfBottles,
    imageUrl: data.whisky.imageUrl,
    // Pricing fields
    marketValue: data.pricing?.marketValue?.toString(),
    marketValueCurrency: data.pricing?.marketValueCurrency,
    marketValueDate: data.pricing?.marketValueDate,
    retailPrice: data.pricing?.retailPrice?.toString(),
    retailPriceCurrency: data.pricing?.retailPriceCurrency,
    retailPriceDate: data.pricing?.retailPriceDate,
    // Rating fields
    averageRating: data.rating?.averageRating?.toString(),
    numberOfRatings: data.rating?.numberOfRatings,
    embedding: null, // Embeddings generated separately
    updatedAt: new Date(),
  }));

  // Batch insert/update whiskies - Drizzle handles batch onConflictDoUpdate
  await db
    .insert(whisky)
    .values(whiskyValues)
    .onConflictDoUpdate({
      target: [whisky.id],
      set: {
        whiskyId: sql`excluded.whisky_id`,
        category: sql`excluded.category`,
        distillery: sql`excluded.distillery`,
        bottler: sql`excluded.bottler`,
        bottlingSeries: sql`excluded.bottling_series`,
        vintage: sql`excluded.vintage`,
        bottledDate: sql`excluded.bottled_date`,
        statedAge: sql`excluded.stated_age`,
        caskType: sql`excluded.cask_type`,
        strength: sql`excluded.strength`,
        size: sql`excluded.size`,
        barcode: sql`excluded.barcode`,
        whiskyGroupId: sql`excluded.whisky_group_id`,
        label: sql`excluded.label`,
        uncolored: sql`excluded.uncolored`,
        nonChillfiltered: sql`excluded.non_chillfiltered`,
        caskStrength: sql`excluded.cask_strength`,
        numberOfBottles: sql`excluded.number_of_bottles`,
        imageUrl: sql`excluded.image_url`,
        // Pricing fields
        marketValue: sql`excluded.market_value`,
        marketValueCurrency: sql`excluded.market_value_currency`,
        marketValueDate: sql`excluded.market_value_date`,
        retailPrice: sql`excluded.retail_price`,
        retailPriceCurrency: sql`excluded.retail_price_currency`,
        retailPriceDate: sql`excluded.retail_price_date`,
        // Rating fields
        averageRating: sql`excluded.average_rating`,
        numberOfRatings: sql`excluded.number_of_ratings`,
        // embedding is not updated here - generated separately
        updatedAt: sql`now()`,
      },
    });

  console.log(`Batch saved: ${batch.length} whiskies processed`);
}

/**
 * Finds the maximum valid whisky ID using binary search
 * Returns the highest ID that exists (not a 404)
 */
async function findMaxWhiskyId(
  scraper: WhiskyScraper,
  startId = 1,
): Promise<number> {
  console.log("Finding maximum whisky ID...");

  const minConsecutive404s = 3000; // Require 3000 consecutive 404s

  // First, use exponential search to find an upper bound
  let upperBound = startId;
  let consecutive404s = 0;
  const recentResults: boolean[] = []; // true = 404, false = found

  console.log("Step 1: Finding upper bound using exponential search...");
  let lastValidId = startId;

  while (true) {
    try {
      await scraper.fetchWhiskyPage(upperBound);
      // Found a valid ID
      consecutive404s = 0;
      recentResults.push(false); // false = not a 404
      if (recentResults.length > minConsecutive404s) {
        recentResults.shift(); // Keep only last windowSize results
      }
      lastValidId = upperBound;

      const nextBound = upperBound * 2;
      if (nextBound > 10_000_000) {
        // Safety limit - we've found a valid ID near the limit
        console.log(
          `Found valid ID at ${upperBound}, using as upper bound for binary search`,
        );
        break;
      }
      upperBound = nextBound;
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        consecutive404s++;
        recentResults.push(true); // true = 404
        if (recentResults.length > minConsecutive404s) {
          recentResults.shift();
        }

        // Check if we meet the rigorous criteria
        const hasEnoughConsecutive = consecutive404s >= minConsecutive404s;

        if (hasEnoughConsecutive) {
          console.log(`Found ${consecutive404s} consecutive 404s`);
          // Back up to the last known valid ID
          upperBound = lastValidId;
          break;
        }

        // If we have many consecutive 404s but haven't checked enough in window,
        // try a smaller increment to fill the window
        if (consecutive404s >= minConsecutive404s / 2) {
          // We're getting close, slow down the search
          upperBound = Math.floor((upperBound + lastValidId) / 2);
          if (upperBound <= lastValidId) {
            // Can't go lower than last valid
            upperBound = lastValidId + 1;
          }
        } else {
          // Still in exponential phase
          upperBound = Math.floor((upperBound + lastValidId) / 2);
          if (upperBound <= lastValidId) {
            upperBound = lastValidId + 1;
          }
        }
      } else {
        // Non-404 error, try next ID
        consecutive404s = 0;
        recentResults.push(false);
        if (recentResults.length > minConsecutive404s) {
          recentResults.shift();
        }
        upperBound++;
      }
    }
  }

  // Now use binary search to find the exact maximum
  // Use the same rigorous criteria to verify we've found the true end
  console.log(`Step 2: Binary search between ${startId} and ${upperBound}...`);
  let left = startId;
  let right = upperBound;
  let maxValidId = startId;
  let binarySearch404s = 0;
  const binarySearchWindow: boolean[] = [];

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    try {
      await scraper.fetchWhiskyPage(mid);
      // This ID exists, so the max is at least mid
      maxValidId = mid;
      binarySearch404s = 0;
      binarySearchWindow.push(false);
      if (binarySearchWindow.length > minConsecutive404s) {
        binarySearchWindow.shift();
      }
      left = mid + 1; // Search in the upper half
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        binarySearch404s++;
        binarySearchWindow.push(true);
        if (binarySearchWindow.length > minConsecutive404s) {
          binarySearchWindow.shift();
        }

        if (binarySearch404s >= minConsecutive404s) {
          console.log(`Confirmed end: ${binarySearch404s} consecutive 404s`);
          break;
        }

        // This ID doesn't exist, search in the lower half
        right = mid - 1;
      } else {
        // Non-404 error, try next ID
        binarySearch404s = 0;
        binarySearchWindow.push(false);
        if (binarySearchWindow.length > minConsecutive404s) {
          binarySearchWindow.shift();
        }
        left = mid + 1;
      }
    }
  }

  console.log(`Found maximum whisky ID: ${maxValidId}`);
  return maxValidId;
}

async function scrape(options: ScrapeOptions = {}): Promise<void> {
  const {
    startId = 1,
    maxId,
    dryRun = false,
    estimatedMaxId = 291265, // Default estimate for progress bar
    findMaxId = false, // Find max ID automatically
    concurrency = 10, // Number of parallel workers
  } = options;

  // Create scraper for finding max ID (still sequential for that)
  const findMaxScraper = new WhiskyScraper({
    rateLimitDelay: 0,
    rawDataDir: "C:/Users/james/Downloads/data/whisky",
  });

  // Find max ID if requested
  let actualMaxId = maxId;
  if (findMaxId && !maxId) {
    actualMaxId = await findMaxWhiskyId(findMaxScraper, startId);
  }

  const startIdForProgress = startId;
  const progressMaxId = actualMaxId ?? estimatedMaxId;

  console.log(
    `Starting scrape from ID ${startIdForProgress}${actualMaxId ? ` to ${actualMaxId}` : ""} with ${concurrency} parallel workers...`,
  );

  // Create progress bar
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Progress |{bar}| {percentage}% | {value}/{total} IDs | ETA: {eta}s | Active: {activeWorkers}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  // Start progress bar
  let processedCount = 0;
  progressBar.start(progressMaxId, startIdForProgress, {
    activeWorkers: 0,
  });

  // Shared state for tracking (thread-safe with proper synchronization)
  const results: { id: number; is404: boolean }[] = [];
  let shouldStop = false;
  let nextId = startId;

  const minConsecutive404s = 3000;

  // Create batch buffer for database operations
  const rawDataDir = "C:/Users/james/Downloads/data/whisky";
  const batchBuffer = new BatchBuffer(100, rawDataDir); // Batch size of 100
  if (!dryRun) {
    batchBuffer.startAutoFlush(10000); // Auto-flush every 10 seconds
  }

  // Worker function
  const worker = async (_workerId: number) => {
    const scraper = new WhiskyScraper({
      rateLimitDelay: 0, // No rate limiting
      rawDataDir: "C:/Users/james/Downloads/data/whisky",
    });

    while (!shouldStop) {
      // Get next ID to process (atomic)
      if (actualMaxId && nextId > actualMaxId) {
        break;
      }
      const currentId = nextId++;

      try {
        const data = await scraper.scrapeWhisky(currentId);

        if (!data) {
          // Not a 404, but no data
          results.push({ id: currentId, is404: false });
          processedCount++;
          progressBar.update(processedCount, {
            activeWorkers: concurrency,
          });
          continue;
        }

        if (!dryRun) {
          batchBuffer.add(data);
        }

        results.push({ id: currentId, is404: false });
        processedCount++;
        progressBar.update(processedCount, {
          activeWorkers: concurrency,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") {
          results.push({ id: currentId, is404: true });
        } else {
          results.push({ id: currentId, is404: false });
          console.error(`\nError scraping whisky ${currentId}:`, error);
        }
        processedCount++;
        progressBar.update(processedCount, {
          activeWorkers: concurrency,
        });
      }

      // Check stopping conditions periodically (only check when we have enough results)
      if (results.length >= minConsecutive404s) {
        // Sort results by ID to check consecutive 404s properly
        const sortedResults = [...results].sort((a, b) => a.id - b.id);
        const recentResults = sortedResults.slice(-minConsecutive404s);

        // Check for consecutive 404s at the end (most recent)
        let consecutive404s = 0;
        for (let i = recentResults.length - 1; i >= 0; i--) {
          if (recentResults[i]?.is404) {
            consecutive404s++;
          } else {
            break;
          }
        }

        if (consecutive404s >= minConsecutive404s) {
          shouldStop = true;
          console.log(
            `\nReached ${consecutive404s} consecutive 404s, stopping`,
          );
          break;
        }
      }
    }
  };

  // Start all workers
  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));

  try {
    // Wait for all workers to complete
    await Promise.all(workers);

    // Find the highest successfully processed ID
    const successfulIds = results.filter((r) => !r.is404).map((r) => r.id);
    const maxProcessedId =
      successfulIds.length > 0 ? Math.max(...successfulIds) : startId - 1;

    // Stop progress bar
    progressBar.stop();

    // Flush any remaining batched data before updating progress
    if (!dryRun) {
      try {
        await batchBuffer.flushAll();
      } catch (error) {
        console.error("Error flushing final batch:", error);
        // Continue anyway - some data may have been saved
      }
    }

    console.log(
      `\nScraping completed. Processed ${processedCount} IDs. Last processed ID: ${maxProcessedId}`,
    );
  } catch (error) {
    shouldStop = true;
    progressBar.stop();
    console.error("\nFatal error during scraping:", error);
    // Flush any remaining batched data before error
    if (!dryRun) {
      try {
        await batchBuffer.flushAll();
      } catch (flushError) {
        console.error("Error flushing batch buffer:", flushError);
      }
    }
    throw error;
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
});

// Parse command line arguments
const args = process.argv.slice(2);
const options: ScrapeOptions = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--start-id" && args[i + 1]) {
    const startId = args[i + 1];
    if (startId) {
      options.startId = parseInt(startId, 10);
    }
    i++;
  } else if (arg === "--max-id" && args[i + 1]) {
    const maxId = args[i + 1];
    if (maxId) {
      options.maxId = parseInt(maxId, 10);
    }
    i++;
  } else if (arg === "--dry-run") {
    options.dryRun = true;
  }
}

// Run the scraper
scrape(options)
  .then(() => {
    console.log("Scraping finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Scraping failed:", error);
    process.exit(1);
  });
