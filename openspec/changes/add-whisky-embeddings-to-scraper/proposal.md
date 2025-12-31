# Change: Add Whisky Embedding Generation to Scraper

## Why

The menu OCR API uses vector search to match extracted menu text to whisky records in the database. Currently, no whisky records have embeddings (0% coverage), causing the vector search to always fall back to text search. To enable semantic matching capabilities (e.g., matching "Auchroisk 12YO" to "Auchroisk 12 years old"), we need to generate and store embeddings for all whisky records during the scraping process. Additionally, saving embeddings locally alongside raw HTML data ensures we can recover from failures without re-generating expensive API calls.

## What Changes

- **ADDED**: Embedding text generation function that constructs searchable text from whisky fields using the format: `{distillery} {vintage??stated_age}{stated_age_used ? ' years old' : ''} {bottling_series}{label? ' {label}' : ''}`
- **ADDED**: OpenAI embedding generation during whisky data scraping and storage
- **ADDED**: Local embedding storage alongside raw HTML data (e.g., `{whiskyId}.embedding.json`) to enable recovery without re-generation
- **ADDED**: Embedding field updates when whiskies are inserted or updated in the database
- **ADDED**: Integration with OpenAI embeddings API in the scraper package
- **MODIFIED**: Scraper to generate and store embeddings for each whisky record during batch processing
- **MODIFIED**: Scraper to load existing embeddings from disk when available to avoid re-generation

## Impact

- Affected specs: `whisky-data-scraping` (modified to include embedding generation and local storage)
- Affected code:
  - `packages/scraper/src/scripts/scrape.ts` - Add embedding generation to saveWhiskyDataBatch function
  - `packages/scraper/src/scraper.ts` - Add methods to save/load embeddings from disk
  - `packages/scraper/src/` - Add OpenAI client initialization and embedding generation utilities
  - `packages/scraper/package.json` - Add OpenAI SDK dependency
  - Environment configuration - OpenAI API key required for scraper
  - Local storage - Embedding JSON files stored in `./data/whisky/` directory alongside HTML files
