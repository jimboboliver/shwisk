/**
 * Utilities for generating whisky embeddings
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate embedding text from whisky data
 * Format: "{distillery} {vintage??stated_age}{stated_age_used ? ' years old' : ''} {bottling_series}{label? ' {label}' : ''}"
 */
export function generateEmbeddingText(whiskyData: {
  distillery?: string | null;
  vintage?: string | null;
  statedAge?: string | null;
  bottlingSeries?: string | null;
  label?: string | null;
}): string {
  const parts: string[] = [];

  // Add distillery (required)
  if (whiskyData.distillery?.trim()) {
    parts.push(whiskyData.distillery.trim());
  }

  // Add vintage or stated age
  let statedAgeUsed = false;
  if (whiskyData.vintage?.trim()) {
    parts.push(whiskyData.vintage.trim());
  } else if (whiskyData.statedAge?.trim()) {
    parts.push(whiskyData.statedAge.trim());
    statedAgeUsed = true;
  }

  // Add " years old" suffix if statedAge was used (not vintage)
  if (statedAgeUsed) {
    parts[parts.length - 1] += " years old";
  }

  // Add bottling series
  if (whiskyData.bottlingSeries?.trim()) {
    parts.push(whiskyData.bottlingSeries.trim());
  }

  // Add label if present (with brackets around it)
  if (whiskyData.label?.trim()) {
    parts.push(`(${whiskyData.label.trim()})`);
  }

  return parts.join(" ").trim();
}

/**
 * Generate embedding vector using OpenAI API
 */
export async function generateEmbedding(
  text: string,
): Promise<number[] | null> {
  if (!text.trim()) {
    return null;
  }

  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
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
 * Save embedding to disk as JSON file
 */
export async function saveEmbeddingToDisk(
  rawDataDir: string,
  whiskyId: number,
  embedding: number[],
): Promise<void> {
  try {
    await fs.mkdir(rawDataDir, { recursive: true });
    const filePath = join(rawDataDir, `${whiskyId}.embedding.json`);
    await fs.writeFile(filePath, JSON.stringify(embedding), "utf-8");
  } catch (error) {
    // Log but don't throw - embedding storage is non-blocking
    console.error(`Failed to save embedding for whisky ${whiskyId}:`, error);
  }
}

/**
 * Load embedding from disk if it exists
 */
export async function loadEmbeddingFromDisk(
  rawDataDir: string,
  whiskyId: number,
): Promise<number[] | null> {
  try {
    const filePath = join(rawDataDir, `${whiskyId}.embedding.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as number[];
  } catch {
    // File doesn't exist or can't be read - return null
    return null;
  }
}

/**
 * Generate or load embedding for a whisky
 * Checks disk first, then generates if needed
 */
export async function getOrGenerateEmbedding(
  rawDataDir: string,
  whiskyId: number,
  whiskyData: {
    distillery?: string | null;
    vintage?: string | null;
    statedAge?: string | null;
    bottlingSeries?: string | null;
    label?: string | null;
  },
): Promise<number[] | null> {
  // Try to load from disk first
  const existingEmbedding = await loadEmbeddingFromDisk(rawDataDir, whiskyId);
  if (existingEmbedding) {
    return existingEmbedding;
  }

  // Generate embedding text
  const embeddingText = generateEmbeddingText(whiskyData);
  if (!embeddingText) {
    return null;
  }

  // Generate embedding
  const embedding = await generateEmbedding(embeddingText);
  if (!embedding) {
    return null;
  }

  // Save to disk
  await saveEmbeddingToDisk(rawDataDir, whiskyId, embedding);

  return embedding;
}
