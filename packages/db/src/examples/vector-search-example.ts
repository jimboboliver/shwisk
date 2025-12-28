/**
 * Example: Using vector search to find similar whiskies
 *
 * This demonstrates how to:
 * 1. Generate embeddings for whisky data
 * 2. Store embeddings in the database
 * 3. Query for similar whiskies using vector similarity
 */

import { desc, eq, sql } from "drizzle-orm";

import { vectorCosineSimilarity } from "@acme/db";
import { db } from "@acme/db/client";
import { whisky } from "@acme/db/schema";

/**
 * Example: Find whiskies similar to a query string
 *
 * This would typically be used when a user types a whisky name
 * from a menu, and you want to find the closest matching whiskies
 * in your database.
 */
export async function findSimilarWhiskies(
  queryEmbedding: number[],
  limit = 10,
) {
  // Find whiskies ordered by cosine similarity (lower distance = more similar)
  const results = await db
    .select({
      id: whisky.id,
      whiskyId: whisky.whiskyId,
      name: whisky.name,
      distillery: whisky.distillery,
      category: whisky.category,
      similarity: vectorCosineSimilarity(whisky.embedding, queryEmbedding),
    })
    .from(whisky)
    .where(sql`${whisky.embedding} IS NOT NULL`)
    .orderBy(desc(vectorCosineSimilarity(whisky.embedding, queryEmbedding)))
    .limit(limit);

  return results;
}

/**
 * Example: Update a whisky's embedding
 *
 * After scraping a whisky, you would generate an embedding
 * from the whisky's name and description, then store it.
 */
export async function updateWhiskyEmbedding(
  whiskyId: number,
  embedding: number[],
) {
  await db
    .update(whisky)
    .set({
      embedding,
      updatedAt: new Date(),
    })
    .where(eq(whisky.id, whiskyId));
}

/**
 * Example: Generate embedding text from whisky data
 *
 * This creates a searchable text representation of the whisky
 * that can be used to generate embeddings.
 */
export function generateWhiskySearchText(whiskyData: {
  name: string;
  distillery?: string | null;
  category?: string | null;
  statedAge?: string | null;
  bottlingSeries?: string | null;
}): string {
  const parts: string[] = [whiskyData.name];

  if (whiskyData.distillery) {
    parts.push(whiskyData.distillery);
  }

  if (whiskyData.category) {
    parts.push(whiskyData.category);
  }

  if (whiskyData.statedAge) {
    parts.push(whiskyData.statedAge);
  }

  if (whiskyData.bottlingSeries) {
    parts.push(whiskyData.bottlingSeries);
  }

  return parts.join(" ");
}

// Example usage with OpenAI embeddings:
/*
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateAndStoreEmbedding(whiskyData: typeof whisky.$inferSelect) {
  // Generate searchable text
  const searchText = generateWhiskySearchText(whiskyData);
  
  // Generate embedding using OpenAI
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small", // or "text-embedding-ada-002"
    input: searchText,
  });
  
  const embedding = response.data[0].embedding;
  
  // Store in database
  await updateWhiskyEmbedding(whiskyData.id, embedding);
}

// When searching:
async function searchWhiskies(query: string) {
  // Generate embedding for the query
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  
  const queryEmbedding = response.data[0].embedding;
  
  // Find similar whiskies
  const results = await findSimilarWhiskies(queryEmbedding, 10);
  
  return results;
}
*/
