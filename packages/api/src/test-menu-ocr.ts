/**
 * Test script for menu OCR API
 *
 * Usage:
 *   pnpm tsx packages/api/src/test-menu-ocr.ts <path-to-image-file>
 *
 * Or with base64 string:
 *   pnpm tsx packages/api/src/test-menu-ocr.ts --base64 <base64-string>
 *
 * Make sure to set required environment variables:
 *   AWS_ACCESS_KEY_ID=...
 *   AWS_SECRET_ACCESS_KEY=...
 *   AWS_REGION=us-east-1
 *   OPENAI_API_KEY=...
 */

import { readFileSync } from "fs";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "./root";

// Get the API URL from environment or use default
// eslint-disable-next-line turbo/no-undeclared-env-vars
const API_URL = process.env.API_URL ?? "http://localhost:3000/api/trpc";

// Create tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: API_URL,
      transformer: superjson,
      headers() {
        return {
          "x-trpc-source": "test-script",
        };
      },
    }),
  ],
});

/**
 * Convert image file to base64
 */
function imageToBase64(filePath: string): { data: string; type: string } {
  const fileBuffer = readFileSync(filePath);
  const base64 = fileBuffer.toString("base64");

  // Determine image type from file extension
  const ext = filePath.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    tiff: "image/tiff",
    tif: "image/tif",
  };

  const imageType = mimeTypes[ext ?? ""] ?? "image/jpeg";

  return { data: base64, type: imageType };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage:");
    console.error(
      "  pnpm tsx packages/api/src/test-menu-ocr.ts <path-to-image-file>",
    );
    console.error(
      "  pnpm tsx packages/api/src/test-menu-ocr.ts --base64 <base64-string> --type <image/jpeg>",
    );
    console.error("");
    console.error("Example:");
    console.error(
      "  pnpm tsx packages/api/src/test-menu-ocr.ts ./test-menu.jpg",
    );
    process.exit(1);
  }

  let imageData: string;
  let imageType: string;

  if (args[0] === "--base64") {
    if (args.length < 2 || !args[1]) {
      console.error("Error: --base64 requires a base64 string");
      process.exit(1);
    }
    imageData = args[1];
    imageType = args[2] === "--type" && args[3] ? args[3] : "image/jpeg";
  } else {
    const imagePath = args[0];
    if (!imagePath) {
      console.error("Error: Image path is required");
      process.exit(1);
    }
    const result = imageToBase64(imagePath);
    imageData = result.data;
    imageType = result.type;
  }

  console.log(`Testing menu OCR API at ${API_URL}`);
  console.log(`Image type: ${imageType}`);
  console.log(`Image size: ${(imageData.length * 3) / 4 / 1024} KB (base64)`);
  console.log("");

  try {
    console.log("Calling menuOcr.processMenu...");
    const startTime = Date.now();

    const result = await trpc.menuOcr.processMenu.mutate({
      image: imageData,
      imageType: imageType as
        | "image/jpeg"
        | "image/jpg"
        | "image/png"
        | "image/tiff"
        | "image/tif",
      markupFactor: 2.5,
    });

    const duration = Date.now() - startTime;

    console.log(`✅ Success! (took ${duration}ms)`);
    console.log("");
    console.log("=== Results ===");
    console.log(`Text blocks found: ${result.textBlocks.length}`);
    console.log(`Menu items processed: ${result.menuItems.length}`);
    console.log("");

    // Show text blocks
    if (result.textBlocks.length > 0) {
      console.log("=== Text Blocks ===");
      result.textBlocks.forEach((block, i) => {
        console.log(`${i + 1}. "${block.text}"`);
        console.log(
          `   Bounding box: (${block.boundingBox.left.toFixed(3)}, ${block.boundingBox.top.toFixed(3)}) ${block.boundingBox.width.toFixed(3)}x${block.boundingBox.height.toFixed(3)}`,
        );
      });
      console.log("");
    }

    // Show menu items with matches
    if (result.menuItems.length > 0) {
      console.log("=== Menu Items ===");
      result.menuItems.forEach((item, i) => {
        console.log(`${i + 1}. "${item.text}"`);
        if (item.extractedPrice) {
          console.log(`   Extracted price: $${item.extractedPrice.toFixed(2)}`);
        } else {
          console.log(`   Extracted price: (not found)`);
        }
        console.log(`   Matches: ${item.matches.length}`);

        item.matches.forEach((match, j) => {
          console.log(`   ${j + 1}. ${match.name ?? "Unknown"}`);
          if (match.distillery) {
            console.log(`      Distillery: ${match.distillery}`);
          }
          if (match.similarityScore !== null) {
            console.log(
              `      Similarity score: ${(match.similarityScore * 100).toFixed(1)}%`,
            );
          }
          if (match.predictedPourPrice) {
            console.log(
              `      Predicted pour price: $${match.predictedPourPrice.toFixed(2)}`,
            );
          }
          console.log(`      Value assessment: ${match.valueAssessment}`);
        });
        console.log("");
      });
    }

    // Summary
    const itemsWithMatches = result.menuItems.filter(
      (item) => item.matches.length > 0,
    );
    const itemsWithPrices = result.menuItems.filter(
      (item) => item.extractedPrice !== null,
    );
    const itemsWithAssessments = result.menuItems.filter((item) =>
      item.matches.some((match) => match.valueAssessment !== "unavailable"),
    );

    console.log("=== Summary ===");
    console.log(`Total text blocks: ${result.textBlocks.length}`);
    console.log(`Menu items: ${result.menuItems.length}`);
    console.log(`Items with whisky matches: ${itemsWithMatches.length}`);
    console.log(`Items with extracted prices: ${itemsWithPrices.length}`);
    console.log(`Items with value assessments: ${itemsWithAssessments.length}`);
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      if (error.stack) {
        console.error("Stack:", error.stack);
      }
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
