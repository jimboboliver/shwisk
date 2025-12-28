/**
 * Utility functions for vector search operations
 */

import { sql } from "drizzle-orm";

/**
 * Creates a SQL fragment for cosine similarity search
 * @param embeddingColumn - The column containing the vector embedding
 * @param queryEmbedding - The query vector to search for
 * @returns SQL fragment for ordering by similarity
 */
export function cosineDistance(
  embeddingColumn: unknown,
  queryEmbedding: number[],
) {
  return sql<number>`${embeddingColumn} <-> ${JSON.stringify(queryEmbedding)}::vector`;
}

/**
 * Creates a SQL fragment for cosine similarity (1 - distance)
 * Higher values = more similar
 * @param embeddingColumn - The column containing the vector embedding
 * @param queryEmbedding - The query vector to search for
 * @returns SQL fragment for ordering by similarity
 */
export function cosineSimilarity(
  embeddingColumn: unknown,
  queryEmbedding: number[],
) {
  return sql<number>`1 - (${embeddingColumn} <-> ${JSON.stringify(queryEmbedding)}::vector)`;
}

/**
 * Creates a SQL fragment for L2 (Euclidean) distance
 * @param embeddingColumn - The column containing the vector embedding
 * @param queryEmbedding - The query vector to search for
 * @returns SQL fragment for ordering by distance
 */
export function l2Distance(embeddingColumn: unknown, queryEmbedding: number[]) {
  return sql<number>`${embeddingColumn} <#> ${JSON.stringify(queryEmbedding)}::vector`;
}

/**
 * Creates a SQL fragment for inner product (negative for similarity)
 * @param embeddingColumn - The column containing the vector embedding
 * @param queryEmbedding - The query vector to search for
 * @returns SQL fragment for ordering by similarity
 */
export function innerProduct(
  embeddingColumn: unknown,
  queryEmbedding: number[],
) {
  return sql<number>`${embeddingColumn} <=> ${JSON.stringify(queryEmbedding)}::vector`;
}
