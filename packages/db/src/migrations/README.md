# Database Migrations

## Enabling pgvector Extension

Before using vector search, you need to enable the `pgvector` extension in your Supabase database:

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **Database** → **Extensions**
3. Search for "vector" and click **Enable**

### Option 2: Via SQL

Run the SQL in `enable-pgvector.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

You can run this in:

- Supabase Dashboard → SQL Editor
- Or via `psql` if you have direct database access

## Creating Vector Index

After enabling the extension and pushing the schema, create an index for efficient vector similarity search:

```sql
CREATE INDEX IF NOT EXISTS whisky_embedding_idx ON whisky
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Note:** The `lists` parameter should be adjusted based on your dataset size:

- Small datasets (< 100K rows): 10-50
- Medium datasets (100K - 1M rows): 50-100
- Large datasets (> 1M rows): 100-200

## Usage

Once enabled, you can:

1. **Store embeddings** when inserting/updating whiskies
2. **Query by similarity** using cosine distance:

```typescript
import { sql } from "drizzle-orm";

import { db } from "@acme/db/client";
import { whisky } from "@acme/db/schema";

// Example: Find similar whiskies by embedding
const queryEmbedding = [
  /* your embedding vector */
];

const similarWhiskies = await db
  .select()
  .from(whisky)
  .orderBy(sql`${whisky.embedding} <-> ${queryEmbedding}::vector`)
  .limit(10);
```

The `<->` operator computes cosine distance (lower is more similar).
