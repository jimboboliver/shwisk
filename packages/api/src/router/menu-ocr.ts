import type { DetectDocumentTextCommandOutput } from "@aws-sdk/client-textract";
import type { TRPCRouterRecord } from "@trpc/server";
import {
  DetectDocumentTextCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import OpenAI from "openai";
import { z } from "zod/v4";

import { ilike, or, sql } from "@acme/db";
import { whisky, whiskyPricing } from "@acme/db/schema";

import type { createTRPCContext } from "../trpc";
import { apiEnv } from "../env";
import { publicProcedure } from "../trpc";

// Initialize environment
const env = apiEnv();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

// Initialize Textract client
const textractClient = new TextractClient({
  region: env.AWS_REGION,
});

// Constants for price prediction
const STANDARD_POUR_SIZE_ML = 30; // 1.5oz in ml
const DEFAULT_MARKUP_FACTOR = 2.5;
const DEFAULT_BOTTLE_SIZE_ML = 700;
const VALUE_THRESHOLD_PERCENT = 10; // 10% threshold for value assessment

// Constants for vector search
const MIN_SIMILARITY_THRESHOLD = 0.7; // Minimum cosine similarity score (0-1)

// Maximum image size: 5MB (Textract limit is 10MB, but we'll be conservative)
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// Supported image formats
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/tif",
] as const;

/**
 * Parse bottle size from text (e.g., "700ml" -> 700)
 */
function parseBottleSize(sizeText: string | null | undefined): number {
  if (!sizeText) {
    return DEFAULT_BOTTLE_SIZE_ML;
  }

  // Extract number followed by "ml" or "ML"
  const regex = /(\d+)\s*ml/i;
  const match = regex.exec(sizeText);
  if (match?.[1]) {
    const ml = parseInt(match[1], 10);
    if (!isNaN(ml) && ml > 0) {
      return ml;
    }
  }

  // Fallback to default if parsing fails
  console.warn(
    `Failed to parse bottle size from: ${sizeText}, defaulting to ${DEFAULT_BOTTLE_SIZE_ML}ml`,
  );
  return DEFAULT_BOTTLE_SIZE_ML;
}

/**
 * Calculate predicted pour price from bottle price and size
 */
function calculatePredictedPourPrice(
  bottlePrice: number,
  bottleSizeMl: number,
  markupFactor: number = DEFAULT_MARKUP_FACTOR,
): number {
  const poursPerBottle = bottleSizeMl / STANDARD_POUR_SIZE_ML;
  return (bottlePrice / poursPerBottle) * markupFactor;
}

/**
 * Assess value by comparing extracted price to predicted price
 */
function assessValue(
  extractedPrice: number | null,
  predictedPrice: number | null,
): "good_value" | "fair" | "overpriced" | "unavailable" {
  if (!extractedPrice || !predictedPrice) {
    return "unavailable";
  }

  const differencePercent =
    ((extractedPrice - predictedPrice) / predictedPrice) * 100;

  if (differencePercent < -VALUE_THRESHOLD_PERCENT) {
    return "good_value";
  } else if (differencePercent > VALUE_THRESHOLD_PERCENT) {
    return "overpriced";
  } else {
    return "fair";
  }
}

/**
 * Extract price from text (looks for currency symbols and numbers)
 */
function extractPrice(text: string): number | null {
  // Match patterns like: $25, $25.50, 25, 25.50, €25, £25, etc.
  const pricePattern = /[$€£¥]?\s*(\d+\.?\d*)/;
  const match = pricePattern.exec(text);
  if (match?.[1]) {
    const price = parseFloat(match[1]);
    if (!isNaN(price) && price > 0) {
      return price;
    }
  }
  return null;
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0]?.embedding ?? null;
  } catch (error) {
    console.error("OpenAI embedding generation error:", error);
    return null;
  }
}

/**
 * Search for whiskies using vector similarity (preferred) or text search (fallback)
 */
async function searchWhiskies(
  db: Awaited<ReturnType<typeof createTRPCContext>>["db"],
  searchText: string,
  limit = 5,
): Promise<
  {
    id: number;
    whiskyId: string;
    name: string | null;
    distillery: string | null;
    category: string | null;
    size: string | null;
    retailPrice: string | null;
    retailPriceCurrency: string | null;
    marketValue: string | null;
    marketValueCurrency: string | null;
    similarityScore: number | null;
  }[]
> {
  // Clean search text - remove common menu formatting
  const cleanedText = searchText.trim().replace(/\s+/g, " ");

  if (cleanedText.length < 3) {
    return [];
  }

  // Try vector search first
  const embedding = await generateEmbedding(cleanedText);

  if (embedding) {
    try {
      // Use pgvector's cosine similarity operator: <=>
      // Lower distance = higher similarity (0 = identical, 2 = completely different)
      // Convert to similarity score: 1 - (distance / 2)
      const vectorResults = await db
        .select({
          id: whisky.id,
          whiskyId: whisky.whiskyId,
          name: whisky.name,
          distillery: whisky.distillery,
          category: whisky.category,
          size: whisky.size,
          retailPrice: whiskyPricing.retailPrice,
          retailPriceCurrency: whiskyPricing.retailPriceCurrency,
          marketValue: whiskyPricing.marketValue,
          marketValueCurrency: whiskyPricing.marketValueCurrency,
          distance: sql<number>`${whisky.embedding} <=> ${JSON.stringify(embedding)}::vector`,
        })
        .from(whisky)
        .leftJoin(whiskyPricing, sql`${whisky.id} = ${whiskyPricing.whiskyId}`)
        .where(sql`${whisky.embedding} IS NOT NULL`)
        .orderBy(
          sql`${whisky.embedding} <=> ${JSON.stringify(embedding)}::vector`,
        )
        .limit(limit);

      // Convert distance to similarity score and filter by threshold
      const resultsWithSimilarity = vectorResults
        .map((result) => ({
          ...result,
          similarityScore: 1 - result.distance / 2,
        }))
        .filter((result) => result.similarityScore >= MIN_SIMILARITY_THRESHOLD);

      if (resultsWithSimilarity.length > 0) {
        return resultsWithSimilarity.map(
          ({ distance: _distance, ...rest }) => rest,
        );
      }
    } catch (error) {
      console.error("Vector search error, falling back to text search:", error);
    }
  }

  // Fallback to text search if vector search unavailable or no results
  const words = cleanedText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    return [];
  }

  // Build search conditions - match against name, distillery, or category
  const conditions = words.map((word) =>
    or(
      ilike(whisky.name, `%${word}%`),
      ilike(whisky.distillery, `%${word}%`),
      ilike(whisky.category, `%${word}%`),
    ),
  );

  const textResults = await db
    .select({
      id: whisky.id,
      whiskyId: whisky.whiskyId,
      name: whisky.name,
      distillery: whisky.distillery,
      category: whisky.category,
      size: whisky.size,
      retailPrice: whiskyPricing.retailPrice,
      retailPriceCurrency: whiskyPricing.retailPriceCurrency,
      marketValue: whiskyPricing.marketValue,
      marketValueCurrency: whiskyPricing.marketValueCurrency,
    })
    .from(whisky)
    .leftJoin(whiskyPricing, sql`${whisky.id} = ${whiskyPricing.whiskyId}`)
    .where(or(...conditions))
    .limit(limit);

  // Text search doesn't have similarity scores
  return textResults.map((result) => ({ ...result, similarityScore: null }));
}

/**
 * Process Textract response and extract text blocks with bounding boxes
 */
function processTextractResponse(response: DetectDocumentTextCommandOutput) {
  const blocks = response.Blocks ?? [];
  const textBlocks: {
    text: string;
    boundingBox: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  }[] = [];

  for (const block of blocks) {
    if (
      block.BlockType === "LINE" &&
      block.Text &&
      block.Geometry?.BoundingBox
    ) {
      const box = block.Geometry.BoundingBox;
      textBlocks.push({
        text: block.Text,
        boundingBox: {
          left: box.Left ?? 0,
          top: box.Top ?? 0,
          width: box.Width ?? 0,
          height: box.Height ?? 0,
        },
      });
    }
  }

  return textBlocks;
}

export const menuOcrRouter = {
  /**
   * Process a menu image and return OCR results with whisky matches and value assessments
   */
  processMenu: publicProcedure
    .input(
      z.object({
        image: z.string(), // Base64 encoded image data
        imageType: z.enum([
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/tiff",
          "image/tif",
        ]),
        markupFactor: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .default(DEFAULT_MARKUP_FACTOR),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate image format
      if (!SUPPORTED_IMAGE_TYPES.includes(input.imageType)) {
        throw new Error(
          `Unsupported image format. Supported formats: ${SUPPORTED_IMAGE_TYPES.join(", ")}`,
        );
      }

      // Decode base64 image and validate size
      let imageBuffer: Buffer;
      try {
        // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        const base64Data = input.image.includes(",")
          ? input.image.split(",")[1]
          : input.image;
        if (!base64Data) {
          throw new Error("Invalid base64 image data");
        }
        imageBuffer = Buffer.from(base64Data, "base64");
      } catch {
        throw new Error("Invalid base64 image data");
      }

      // Validate image size
      if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image size exceeds maximum allowed size of ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`,
        );
      }

      // Call Textract to extract text
      let textractResponse;
      try {
        const command = new DetectDocumentTextCommand({
          Document: {
            Bytes: imageBuffer,
          },
        });
        textractResponse = await textractClient.send(command);
      } catch (error) {
        console.error("Textract API error:", error);
        throw new Error(
          "Failed to process image with OCR. Please check AWS credentials and region configuration.",
        );
      }

      // Process Textract response
      const textBlocks = processTextractResponse(textractResponse);

      // Group text blocks into potential menu items (simple heuristic: consecutive lines)
      // For now, we'll treat each text block as a potential item and try to match it
      const menuItems = await Promise.all(
        textBlocks.map(async (block) => {
          const extractedPrice = extractPrice(block.text);
          const whiskyMatches = await searchWhiskies(ctx.db, block.text, 3);

          // Process matches to get predicted prices and value assessments
          const processedMatches = whiskyMatches.map(
            (match: {
              id: number;
              whiskyId: string;
              name: string | null;
              distillery: string | null;
              category: string | null;
              size: string | null;
              retailPrice: string | null;
              retailPriceCurrency: string | null;
              marketValue: string | null;
              marketValueCurrency: string | null;
              similarityScore: number | null;
            }) => {
              // Determine which price to use (retail price preferred, fallback to market value)
              const priceText = match.retailPrice ?? match.marketValue;
              const price = priceText ? parseFloat(priceText) : null;
              const bottleSizeMl = parseBottleSize(match.size);

              let predictedPourPrice: number | null = null;
              if (price !== null && !isNaN(price)) {
                predictedPourPrice = calculatePredictedPourPrice(
                  price,
                  bottleSizeMl,
                  input.markupFactor,
                );
              }

              const valueAssessment = assessValue(
                extractedPrice,
                predictedPourPrice,
              );

              return {
                whiskyId: match.id,
                whiskyDbId: match.whiskyId,
                name: match.name,
                distillery: match.distillery,
                category: match.category,
                bottleSize: match.size,
                bottlePrice: price,
                predictedPourPrice,
                valueAssessment,
                similarityScore: match.similarityScore,
              };
            },
          );

          return {
            text: block.text,
            boundingBox: block.boundingBox,
            extractedPrice,
            matches: processedMatches,
          };
        }),
      );

      return {
        textBlocks: textBlocks.map((b) => ({
          text: b.text,
          boundingBox: b.boundingBox,
        })),
        menuItems,
      };
    }),
} satisfies TRPCRouterRecord;
