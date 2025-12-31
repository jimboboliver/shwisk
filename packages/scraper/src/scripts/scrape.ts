import * as cliProgress from "cli-progress";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@acme/db/client";
import {
  whisky,
  whiskyPricing,
  whiskyRating,
  whiskyScrapingProgress,
} from "@acme/db/schema";

import { WhiskyScraper } from "../scraper";

interface ScrapeOptions {
  startId?: number;
  maxId?: number;
  dryRun?: boolean;
  estimatedMaxId?: number; // Estimated maximum ID for progress bar
  findMaxId?: boolean; // If true, find the max ID automatically before scraping
  concurrency?: number; // Number of parallel workers (default: 10, reduced to avoid DB connection limits)
}

async function updateProgress(
  lastProcessedId: number,
  status: string,
  errorMessage?: string,
): Promise<void> {
  try {
    await db
      .update(whiskyScrapingProgress)
      .set({
        lastProcessedId,
        status,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(whiskyScrapingProgress.id, 1));
  } catch (error) {
    // Silently fail progress updates - they're not critical
    // Log only if it's not a circuit breaker error
    if (error instanceof Error && !error.message.includes("Circuit breaker")) {
      console.error("Error updating progress (non-critical):", error);
    }
    // Don't throw - progress updates are not critical for scraping
  }
}

interface WhiskyData {
  whisky: {
    id: number;
    whiskyId: string;
    name: string;
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
  private onProgress?: (message: string) => void;
  private totalBatchesSaved = 0;
  private totalWhiskiesSaved = 0;

  constructor(
    batchSize = 25,
    rawDataDir = "./data/whisky",
    onProgress?: (message: string) => void,
  ) {
    this.batchSize = batchSize;
    this.rawDataDir = rawDataDir;
    this.onProgress = onProgress;
  }

  add(data: WhiskyData): void {
    // Add to buffer immediately (non-blocking)
    this.buffer.push(data);

    // Trigger flush if batch size reached, but don't wait for it
    if (this.buffer.length >= this.batchSize && !this.flushing) {
      // Start flush asynchronously, don't await
      this.flush().catch((error) => {
        console.error("Error during batch flush:", error);
      });
    }
  }

  startAutoFlush(intervalMs = 5000): void {
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0 && !this.flushing) {
        this.flush().catch((error) => {
          console.error("Error during auto-flush:", error);
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

    // Capture batch number before async operation
    const batchNumber = this.totalBatchesSaved + 1;

    this.flushPromise = (async () => {
      try {
        await saveWhiskyDataBatch(batch, this.rawDataDir, (message) => {
          this.onProgress?.(`[Batch ${batchNumber}] ${message}`);
        });
        this.totalBatchesSaved++;
        this.totalWhiskiesSaved += batch.length;
        this.onProgress?.(
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
  rawDataDir = "./data/whisky",
  onProgress?: (message: string) => void,
): Promise<void> {
  if (batch.length === 0) return;

  // Split large batches into smaller chunks to avoid stack overflow
  const CHUNK_SIZE = 25;
  if (batch.length > CHUNK_SIZE) {
    // Process in chunks
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      await saveWhiskyDataBatch(chunk, rawDataDir, onProgress);
    }
    return;
  }

  onProgress?.(`Processing batch of ${batch.length} whiskies...`);

  // Batch insert/update whiskies
  // Note: Embeddings are generated separately using generate-embeddings script
  const whiskyValues = batch.map((data) => ({
    id: data.whisky.id,
    whiskyId: data.whisky.whiskyId,
    name: data.whisky.name,
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
        name: sql`excluded.name`,
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
        // embedding is not updated here - generated separately
        updatedAt: sql`now()`,
      },
    });

  // Get existing pricing and rating records for batch
  const whiskyIds = batch.map((data) => data.whisky.id);
  const existingPricing = await db
    .select()
    .from(whiskyPricing)
    .where(inArray(whiskyPricing.whiskyId, whiskyIds));
  const existingRating = await db
    .select()
    .from(whiskyRating)
    .where(inArray(whiskyRating.whiskyId, whiskyIds));

  const existingPricingIds = new Set(existingPricing.map((p) => p.whiskyId));
  const existingRatingIds = new Set(existingRating.map((r) => r.whiskyId));

  // Batch update/insert pricing
  const pricingToUpdate: (typeof whiskyPricing.$inferInsert)[] = [];
  const pricingToInsert: (typeof whiskyPricing.$inferInsert)[] = [];

  for (const data of batch) {
    if (data.pricing) {
      const pricingData = {
        whiskyId: data.whisky.id,
        marketValue: data.pricing.marketValue?.toString(),
        marketValueCurrency: data.pricing.marketValueCurrency,
        marketValueDate: data.pricing.marketValueDate,
        retailPrice: data.pricing.retailPrice?.toString(),
        retailPriceCurrency: data.pricing.retailPriceCurrency,
        retailPriceDate: data.pricing.retailPriceDate,
      };

      if (existingPricingIds.has(data.whisky.id)) {
        pricingToUpdate.push(pricingData);
      } else {
        pricingToInsert.push(pricingData);
      }
    }
  }

  // Batch update pricing
  if (pricingToUpdate.length > 0) {
    // Drizzle doesn't support batch updates directly, so we'll do them individually
    // but in a transaction for better performance
    await db.transaction(async (tx) => {
      for (const pricing of pricingToUpdate) {
        await tx
          .update(whiskyPricing)
          .set(pricing)
          .where(eq(whiskyPricing.whiskyId, pricing.whiskyId));
      }
    });
  }

  // Batch insert pricing
  if (pricingToInsert.length > 0) {
    await db.insert(whiskyPricing).values(pricingToInsert);
  }

  // Batch update/insert rating
  const ratingToUpdate: (typeof whiskyRating.$inferInsert)[] = [];
  const ratingToInsert: (typeof whiskyRating.$inferInsert)[] = [];

  for (const data of batch) {
    if (data.rating) {
      const ratingData = {
        whiskyId: data.whisky.id,
        averageRating: data.rating.averageRating?.toString(),
        numberOfRatings: data.rating.numberOfRatings,
      };

      if (existingRatingIds.has(data.whisky.id)) {
        ratingToUpdate.push(ratingData);
      } else {
        ratingToInsert.push(ratingData);
      }
    }
  }

  // Batch update rating
  if (ratingToUpdate.length > 0) {
    await db.transaction(async (tx) => {
      for (const rating of ratingToUpdate) {
        await tx
          .update(whiskyRating)
          .set(rating)
          .where(eq(whiskyRating.whiskyId, rating.whiskyId));
      }
    });
  }

  // Batch insert rating
  if (ratingToInsert.length > 0) {
    await db.insert(whiskyRating).values(ratingToInsert);
  }

  onProgress?.(`Batch saved: ${batch.length} whiskies processed`);
}

// Legacy function - kept for reference but not used (replaced by batch operations)
async function _saveWhiskyData(data: WhiskyData): Promise<void> {
  // Insert or update whisky
  await db
    .insert(whisky)
    .values({
      id: data.whisky.id,
      whiskyId: data.whisky.whiskyId,
      name: data.whisky.name,
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
      uncolored: data.whisky.uncolored,
      nonChillfiltered: data.whisky.nonChillfiltered,
      caskStrength: data.whisky.caskStrength,
      numberOfBottles: data.whisky.numberOfBottles,
      imageUrl: data.whisky.imageUrl,
    })
    .onConflictDoUpdate({
      target: [whisky.id],
      set: {
        whiskyId: data.whisky.whiskyId,
        name: data.whisky.name,
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
        uncolored: data.whisky.uncolored,
        nonChillfiltered: data.whisky.nonChillfiltered,
        caskStrength: data.whisky.caskStrength,
        numberOfBottles: data.whisky.numberOfBottles,
        imageUrl: data.whisky.imageUrl,
        updatedAt: new Date(),
      },
    });

  // Update or insert pricing data
  if (data.pricing) {
    const existingPricing = await db
      .select()
      .from(whiskyPricing)
      .where(eq(whiskyPricing.whiskyId, data.whisky.id))
      .limit(1);

    if (existingPricing.length > 0) {
      // Update existing record
      await db
        .update(whiskyPricing)
        .set({
          marketValue: data.pricing.marketValue?.toString(),
          marketValueCurrency: data.pricing.marketValueCurrency,
          marketValueDate: data.pricing.marketValueDate,
          retailPrice: data.pricing.retailPrice?.toString(),
          retailPriceCurrency: data.pricing.retailPriceCurrency,
          retailPriceDate: data.pricing.retailPriceDate,
        })
        .where(eq(whiskyPricing.whiskyId, data.whisky.id));
    } else {
      // Insert new record
      await db.insert(whiskyPricing).values({
        whiskyId: data.whisky.id,
        marketValue: data.pricing.marketValue?.toString(),
        marketValueCurrency: data.pricing.marketValueCurrency,
        marketValueDate: data.pricing.marketValueDate,
        retailPrice: data.pricing.retailPrice?.toString(),
        retailPriceCurrency: data.pricing.retailPriceCurrency,
        retailPriceDate: data.pricing.retailPriceDate,
      });
    }
  }

  // Update or insert rating data
  if (data.rating) {
    const existingRating = await db
      .select()
      .from(whiskyRating)
      .where(eq(whiskyRating.whiskyId, data.whisky.id))
      .limit(1);

    if (existingRating.length > 0) {
      // Update existing record
      await db
        .update(whiskyRating)
        .set({
          averageRating: data.rating.averageRating?.toString(),
          numberOfRatings: data.rating.numberOfRatings,
        })
        .where(eq(whiskyRating.whiskyId, data.whisky.id));
    } else {
      // Insert new record
      await db.insert(whiskyRating).values({
        whiskyId: data.whisky.id,
        averageRating: data.rating.averageRating?.toString(),
        numberOfRatings: data.rating.numberOfRatings,
      });
    }
  }
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

  // More rigorous approach: require both consecutive 404s AND high 404 rate in window
  const minConsecutive404s = 3000; // Require 3000 consecutive 404s
  const windowSize = 4500; // Check last 4500 IDs (must be >= minConsecutive404s)
  const min404Rate = 0.95; // Require 95% 404 rate in window

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
      if (recentResults.length > windowSize) {
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
        if (recentResults.length > windowSize) {
          recentResults.shift();
        }

        // Check if we meet the rigorous criteria
        const hasEnoughConsecutive = consecutive404s >= minConsecutive404s;
        const recent404Rate =
          recentResults.length >= windowSize
            ? recentResults.filter((r) => r).length / recentResults.length
            : 0;
        const hasHigh404Rate = recent404Rate >= min404Rate;

        if (hasEnoughConsecutive && hasHigh404Rate) {
          // We've met both criteria - this is likely the end
          console.log(
            `Found ${consecutive404s} consecutive 404s with ${(recent404Rate * 100).toFixed(1)}% 404 rate in last ${recentResults.length} IDs`,
          );
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
        if (recentResults.length > windowSize) {
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
      if (binarySearchWindow.length > windowSize) {
        binarySearchWindow.shift();
      }
      left = mid + 1; // Search in the upper half
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        binarySearch404s++;
        binarySearchWindow.push(true);
        if (binarySearchWindow.length > windowSize) {
          binarySearchWindow.shift();
        }

        // Check if we've found the true end using rigorous criteria
        const recent404Rate =
          binarySearchWindow.length >= windowSize
            ? binarySearchWindow.filter((r) => r).length /
              binarySearchWindow.length
            : 0;

        if (
          binarySearch404s >= minConsecutive404s &&
          recent404Rate >= min404Rate
        ) {
          // We've confirmed the end - this ID and above don't exist
          console.log(
            `Confirmed end: ${binarySearch404s} consecutive 404s with ${(recent404Rate * 100).toFixed(1)}% 404 rate`,
          );
          break;
        }

        // This ID doesn't exist, search in the lower half
        right = mid - 1;
      } else {
        // Non-404 error, try next ID
        binarySearch404s = 0;
        binarySearchWindow.push(false);
        if (binarySearchWindow.length > windowSize) {
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
    concurrency = 10, // Number of parallel workers (reduced to avoid DB connection limits)
  } = options;

  // Create scraper for finding max ID (still sequential for that)
  const findMaxScraper = new WhiskyScraper({
    rateLimitDelay: 0,
    rawDataDir: "./data/whisky",
  });

  // Find max ID if requested
  let actualMaxId = maxId;
  if (findMaxId && !maxId) {
    actualMaxId = await findMaxWhiskyId(findMaxScraper, startId);
  }

  const startIdForProgress = startId;
  const progressMaxId = actualMaxId ?? estimatedMaxId;

  // Update status to running
  if (!dryRun) {
    await updateProgress(startId - 1, "running");
  }

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
  const windowSize = 4500; // Must be >= minConsecutive404s to detect consecutive pattern
  const min404Rate = 0.95;

  // Create batch buffer for database operations
  const rawDataDir = "./data/whisky";
  const batchBuffer = new BatchBuffer(50, rawDataDir, (message) => {
    // Log batch progress below the progress bar
    console.log(`\n${message}`);
  }); // Batch size of 50
  if (!dryRun) {
    batchBuffer.startAutoFlush(10000); // Auto-flush every 10 seconds (reduced frequency to avoid DB load)
  }

  // Worker function
  const worker = async (_workerId: number) => {
    const scraper = new WhiskyScraper({
      rateLimitDelay: 0, // No rate limiting
      rawDataDir: "./data/whisky",
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

        // Progress updates disabled during active scraping to avoid circuit breaker issues
        // Progress will only be updated at the end
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
      if (results.length >= windowSize) {
        // Sort results by ID to check consecutive 404s properly
        const sortedResults = [...results].sort((a, b) => a.id - b.id);
        const recentResults = sortedResults.slice(-windowSize);
        const recent404s = recentResults.filter((r) => r.is404);
        const recent404Rate = recent404s.length / recentResults.length;

        // Check for consecutive 404s at the end (most recent)
        let consecutive404s = 0;
        for (let i = recentResults.length - 1; i >= 0; i--) {
          if (recentResults[i]?.is404) {
            consecutive404s++;
          } else {
            break;
          }
        }

        if (
          consecutive404s >= minConsecutive404s &&
          recent404Rate >= min404Rate
        ) {
          shouldStop = true;
          console.log(
            `\nReached ${consecutive404s} consecutive 404s with ${(recent404Rate * 100).toFixed(1)}% 404 rate, stopping`,
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
      await updateProgress(maxProcessedId, "completed");
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
      const maxProcessedId =
        results.length > 0
          ? Math.max(...results.map((r) => r.id))
          : startId - 1;
      await updateProgress(
        maxProcessedId,
        "error",
        error instanceof Error ? error.message : String(error),
      );
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
