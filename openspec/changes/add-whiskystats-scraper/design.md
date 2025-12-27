## Context

Whiskystats.com provides comprehensive whisky market data accessible via individual whisky pages at `https://www.whiskystats.com/whisky/{id}` where `id` is a sequential integer starting from 1. Each page contains detailed product information, pricing data, ratings, and metadata that is essential for the application's value assessment functionality. The scraper will iterate through IDs sequentially until encountering a 404 error, indicating the end of available entries.

## Goals / Non-Goals

### Goals

- Extract and store comprehensive whisky product data from Whiskystats.com
- Support long-running scraping operations that automatically discover the full range of available entries
- Enable resumable scraping with progress tracking
- Store historical pricing data with timestamps
- Store raw scraped data on disk for backup and re-processing
- Handle rate limiting and respect website resources

### Non-Goals

- Real-time data synchronization (initial bulk import only)
- Scraping auction listings or detailed retail listings (focus on summary data)
- Image storage (store URLs only, not binary image data)
- User-facing scraping interface (CLI/script-based)

## Decisions

### Decision: Database Schema Design

**What**: Separate tables for whisky products, pricing data, ratings, and metadata
**Why**:

- Normalized structure allows efficient querying
- Pricing data is time-series (multiple values per whisky)
- Ratings are user-generated (multiple ratings per whisky)
- Enables future expansion without schema changes

**Alternatives considered**:

- Single denormalized table: Rejected due to pricing/rating cardinality and update complexity
- JSON columns: Rejected for queryability and type safety

### Decision: Scraping Library

**What**: Use established HTTP client (e.g., `axios` or `node-fetch`) with HTML parser (e.g., `cheerio` or `jsdom`)
**Why**:

- Simple, proven approach for static HTML scraping
- Good error handling and retry capabilities
- No need for browser automation for this use case

**Alternatives considered**:

- Playwright/Puppeteer: Rejected as overkill for static content
- API endpoints: Not available from Whiskystats.com

### Decision: Rate Limiting Strategy

**What**: Implement configurable delay between requests (e.g., 1-2 seconds) with exponential backoff on errors
**Why**:

- Respectful scraping to avoid overwhelming server
- Prevents IP blocking
- Configurable for different environments

**Alternatives considered**:

- No rate limiting: Rejected for ethical and practical reasons
- Fixed high delay: Rejected as too slow for 291K entries

### Decision: Progress Tracking

**What**: Database table tracking last processed ID and scraping status
**Why**:

- Enables resumability after interruptions
- Provides visibility into scraping progress
- Allows selective re-scraping of failed entries

**Alternatives considered**:

- File-based tracking: Rejected for consistency and multi-instance support
- No tracking: Rejected as makes debugging and resumption impossible

### Decision: Termination Strategy

**What**: Scraper runs sequentially from ID 1 until encountering a 404 HTTP status code
**Why**:

- Adapts automatically to changes in dataset size without hardcoded limits
- 404 indicates non-existent page, providing clear termination signal
- Simple and reliable detection mechanism
- No need to know total count in advance

**Alternatives considered**:

- Hardcoded upper limit: Rejected as dataset grows over time and requires manual updates
- Continuous monitoring: Rejected as unnecessary complexity for initial bulk import

### Decision: Raw Data Storage

**What**: Store raw scraped HTML on disk alongside database storage
**Why**:

- Enables re-processing data without re-scraping if parsing logic changes
- Provides backup in case of database issues
- Facilitates debugging and data analysis
- Allows inspection of original source data
- Preserves complete original HTML for future parsing improvements

**Alternatives considered**:

- Database-only storage: Rejected as makes re-processing and debugging difficult
- JSON storage: Rejected as HTML preserves the original source and allows re-parsing with improved logic
- Cloud storage: Rejected as adds complexity; local disk is sufficient for initial implementation

## Risks / Trade-offs

### Risk: Website Structure Changes

**Mitigation**:

- Robust HTML parsing with fallbacks
- Data validation to detect structural changes
- Regular monitoring of scraping success rate

### Risk: Rate Limiting / IP Blocking

**Mitigation**:

- Conservative rate limiting (1-2s delays)
- Exponential backoff on errors
- User-agent and request headers to identify as legitimate scraper

### Risk: Large Dataset Size

**Mitigation**:

- Batch database insertions
- Indexed database schema for performance
- Progress tracking to enable incremental processing

### Risk: False 404 Detection

**Mitigation**:

- Verify 404 is actual page not found (not temporary server error)
- Implement retry logic for network errors vs. actual 404s
- Log termination point for manual verification if needed

### Risk: Data Quality / Completeness

**Mitigation**:

- Validation of required fields
- Null handling for optional fields
- Logging of data quality issues

### Risk: Disk Storage Requirements

**Mitigation**:

- Store raw HTML files (larger than JSON but preserves original source)
- Implement configurable storage location
- Consider compression or cleanup strategies for old raw data if needed

### Trade-off: Scraping Speed vs. Server Load

- Slower scraping (1-2s delays) ensures sustainable operation but takes longer
- Acceptable for initial bulk import; can optimize later if needed

## Migration Plan

1. **Schema Migration**: Run database migrations to create new tables
2. **Initial Scrape**: Run scraping script to populate database
3. **Data Validation**: Verify data quality and completeness
4. **Integration**: Connect scraped data to value assessment features

**Rollback**:

- Database migrations can be rolled back if needed
- Scraped data can be truncated without affecting other features

## Open Questions

- Should we scrape images or just store URLs?
- How frequently should we re-scrape for updated pricing data?
- Should we implement incremental updates or full re-scrapes?
- What is the expected data volume and storage requirements?
