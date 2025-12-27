# Change: Add Whiskystats.com Data Scraper

## Why

The application requires comprehensive whisky market data to enable accurate value assessments when comparing menu prices. Whiskystats.com provides detailed whisky information including retail prices, market values, ratings, and product metadata for a large number of whiskies. Scraping this data will populate our database with the market intelligence needed to power the core value assessment feature.

## What Changes

- **ADDED**: Database schema for storing whisky product data, pricing information, ratings, and metadata from Whiskystats.com
- **ADDED**: Web scraping infrastructure to extract data from Whiskystats.com whisky pages
- **ADDED**: Long-running scraping script to systematically process all available whisky entries, starting from ID 1 and continuing until encountering a 404 error
- **ADDED**: Raw data storage on disk for backup, debugging, and re-processing capabilities
- **ADDED**: Data validation and error handling for scraped content
- **ADDED**: Scraping progress tracking and resumability

## Impact

- Affected specs: New capability `whisky-data-scraping`
- Affected code:
  - `packages/db/src/schema.ts` - New database tables for whisky data
  - New scraping script/module (location TBD)
  - Database migrations for new schema
  - Raw data storage directory structure (location TBD)
