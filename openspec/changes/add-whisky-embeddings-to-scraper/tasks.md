## 1. Investigation & Setup

- [ ] 1.1 Verify OpenAI API key is available in scraper environment
- [ ] 1.2 Check if OpenAI SDK is already available in scraper package
- [ ] 1.3 Review embedding text format requirements and clarify "label" field mapping (likely maps to `name` field)
- [ ] 1.4 Review raw data directory structure (`C:/Users/james/Downloads/data/whisky/`)

## 2. Embedding Text Generation

- [ ] 2.1 Create function to generate embedding text from whisky data using format: `{distillery} {vintage??stated_age}{stated_age_used ? ' years old' : ''} {bottling_series}{label? ' {label}' : ''}`
- [ ] 2.2 Handle edge cases (missing fields, null values, empty strings)
- [ ] 2.3 Test embedding text generation with various whisky data combinations
- [ ] 2.4 Verify text format matches expected pattern for semantic matching

## 3. OpenAI Integration

- [ ] 3.1 Add OpenAI SDK dependency to scraper package if not present
- [ ] 3.2 Create OpenAI client initialization in scraper
- [ ] 3.3 Create function to generate embeddings using `text-embedding-3-small` model
- [ ] 3.4 Add error handling for OpenAI API failures
- [ ] 3.5 Add rate limiting/retry logic for OpenAI API calls

## 4. Local Embedding Storage

- [ ] 4.1 Add method to save embeddings to disk as JSON files (e.g., `{whiskyId}.embedding.json`) in `C:/Users/james/Downloads/data/whisky/` directory
- [ ] 4.2 Add method to load embeddings from disk if file exists
- [ ] 4.3 Handle file I/O errors gracefully (log and continue)
- [ ] 4.4 Ensure embedding storage is non-blocking (similar to raw HTML storage)

## 5. Scraper Integration

- [ ] 5.1 Modify `saveWhiskyDataBatch` to check for existing embeddings on disk before generating
- [ ] 5.2 Generate embeddings for whiskies that don't have local embedding files
- [ ] 5.3 Save newly generated embeddings to disk immediately after generation
- [ ] 5.4 Update database insert/update logic to include embedding field (from disk or newly generated)
- [ ] 5.5 Handle embedding generation failures gracefully (log and continue without embedding)
- [ ] 5.6 Add progress logging for embedding generation

## 6. Testing & Validation

- [ ] 6.1 Test embedding generation with sample whisky data
- [ ] 6.2 Verify embeddings are saved correctly to disk
- [ ] 6.3 Verify embeddings are loaded from disk on subsequent runs
- [ ] 6.4 Verify embeddings are stored correctly in database
- [ ] 6.5 Test scraper with embedding generation enabled
- [ ] 6.6 Verify vector search works with newly generated embeddings
- [ ] 6.7 Test error handling when OpenAI API is unavailable
- [ ] 6.8 Test recovery scenario: verify embeddings are loaded from disk after scraper restart
