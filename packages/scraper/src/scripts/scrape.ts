import * as cliProgress from "cli-progress";
import { eq } from "drizzle-orm";

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
}

async function getLastProcessedId(): Promise<number> {
  const progress = await db
    .select()
    .from(whiskyScrapingProgress)
    .where(eq(whiskyScrapingProgress.id, 1))
    .limit(1);

  if (progress.length === 0) {
    // Initialize progress table
    await db.insert(whiskyScrapingProgress).values({
      id: 1,
      lastProcessedId: 0,
      status: "idle",
    });
    return 0;
  }

  return progress[0]?.lastProcessedId ?? 0;
}

async function updateProgress(
  lastProcessedId: number,
  status: string,
  errorMessage?: string,
): Promise<void> {
  await db
    .update(whiskyScrapingProgress)
    .set({
      lastProcessedId,
      status,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(whiskyScrapingProgress.id, 1));
}

async function checkIfWhiskyExists(whiskyId: number): Promise<boolean> {
  const result = await db
    .select()
    .from(whisky)
    .where(eq(whisky.id, whiskyId))
    .limit(1);

  return result.length > 0;
}

async function saveWhiskyData(data: {
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
}): Promise<void> {
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
  const minConsecutive404s = 50; // Require 50 consecutive 404s
  const windowSize = 100; // Check last 100 IDs
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
  } = options;

  const scraper = new WhiskyScraper({
    rateLimitDelay: 200, // 0.2 seconds between requests
    rawDataDir: "./data/whisky",
  });

  // Find max ID if requested
  let actualMaxId = maxId;
  if (findMaxId && !maxId) {
    actualMaxId = await findMaxWhiskyId(scraper, startId);
  }

  // Ignore lastProcessedId for now - always start from startId
  let currentId = startId - 1;

  const startIdForProgress = currentId + 1;
  const progressMaxId = actualMaxId ?? estimatedMaxId;

  // Update status to running
  if (!dryRun) {
    await updateProgress(currentId, "running");
  }

  console.log(
    `Starting scrape from ID ${startIdForProgress}${maxId ? ` to ${maxId}` : ""}...`,
  );

  // Create progress bar
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Progress |{bar}| {percentage}% | {value}/{total} IDs | ETA: {eta}s | Current: {currentId}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  // Start progress bar
  progressBar.start(progressMaxId, startIdForProgress, {
    currentId: startIdForProgress,
  });

  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 10;

  // Use rigorous criteria for 404 detection (same as findMaxWhiskyId)
  let consecutive404s = 0;
  const minConsecutive404s = 50; // Require 50 consecutive 404s
  const windowSize = 100; // Check last 100 IDs
  const min404Rate = 0.95; // Require 95% 404 rate in window
  const recent404Results: boolean[] = []; // true = 404, false = found

  try {
    while (true) {
      currentId++;

      if (actualMaxId && currentId > actualMaxId) {
        console.log(`Reached max ID ${actualMaxId}`);
        break;
      }

      // Update progress bar
      progressBar.update(currentId, { currentId });

      // Always scrape, even if it exists - we want to update existing records

      try {
        const data = await scraper.scrapeWhisky(currentId);

        if (!data) {
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            progressBar.stop();
            console.log(`\nToo many consecutive errors, stopping`);
            break;
          }
          // Not a 404, so reset 404 tracking
          consecutive404s = 0;
          recent404Results.push(false);
          if (recent404Results.length > windowSize) {
            recent404Results.shift();
          }
          continue;
        }

        if (!dryRun) {
          await saveWhiskyData(data);
          await updateProgress(currentId, "running");
        } else {
          console.log(`\n[DRY RUN] Would save:`, JSON.stringify(data, null, 2));
        }

        consecutiveErrors = 0; // Reset error counter on success
        consecutive404s = 0; // Reset 404 counter on success
        recent404Results.push(false); // Not a 404
        if (recent404Results.length > windowSize) {
          recent404Results.shift();
        }
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") {
          consecutive404s++;
          recent404Results.push(true); // true = 404
          if (recent404Results.length > windowSize) {
            recent404Results.shift();
          }

          // Check if we meet the rigorous criteria
          const hasEnoughConsecutive = consecutive404s >= minConsecutive404s;
          const recent404Rate =
            recent404Results.length >= windowSize
              ? recent404Results.filter((r) => r).length /
                recent404Results.length
              : 0;
          const hasHigh404Rate = recent404Rate >= min404Rate;

          // Log progress
          if (consecutive404s % 10 === 0 || hasEnoughConsecutive) {
            console.log(
              `\n404 for whisky ${currentId} (${consecutive404s} consecutive, ${(recent404Rate * 100).toFixed(1)}% in last ${recent404Results.length} IDs)`,
            );
          }

          if (hasEnoughConsecutive && hasHigh404Rate) {
            progressBar.stop();
            console.log(
              `\nReached ${consecutive404s} consecutive 404s with ${(recent404Rate * 100).toFixed(1)}% 404 rate in last ${recent404Results.length} IDs, stopping`,
            );
            break;
          }
          // Continue to next ID instead of breaking
          continue;
        }

        console.error(`\nError scraping whisky ${currentId}:`, error);
        consecutiveErrors++;
        consecutive404s = 0; // Reset 404 counter on non-404 error
        recent404Results.push(false); // Not a 404
        if (recent404Results.length > windowSize) {
          recent404Results.shift();
        }

        if (consecutiveErrors >= maxConsecutiveErrors) {
          progressBar.stop();
          console.log(`\nToo many consecutive errors, stopping`);
          if (!dryRun) {
            await updateProgress(
              currentId - 1,
              "error",
              error instanceof Error ? error.message : String(error),
            );
          }
          break;
        }
      }
    }

    // Stop progress bar
    progressBar.stop();

    if (!dryRun) {
      await updateProgress(currentId - 1, "completed");
    }

    console.log(`\nScraping completed. Last processed ID: ${currentId - 1}`);
  } catch (error) {
    progressBar.stop();
    console.error("\nFatal error during scraping:", error);
    if (!dryRun) {
      await updateProgress(
        currentId - 1,
        "error",
        error instanceof Error ? error.message : String(error),
      );
    }
    throw error;
  }
}

// Handle graceful shutdown
let isShuttingDown = false;

process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  isShuttingDown = true;
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
