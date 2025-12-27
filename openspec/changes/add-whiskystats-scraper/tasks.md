## 1. Investigation & Design

- [x] 1.1 Investigate Whiskystats.com page structure and available data fields
- [x] 1.2 Identify rate limiting and scraping constraints
- [x] 1.3 Design database schema for whisky data, pricing, and ratings
- [x] 1.4 Design scraping architecture (rate limiting, error handling, resumability)

## 2. Database Schema

- [x] 2.1 Create whisky table schema (id, name, distillery, bottler, age, etc.)
- [x] 2.2 Create pricing tables (market value, retail price with timestamps)
- [x] 2.3 Create ratings table
- [x] 2.4 Create whisky metadata tables (cask type, flags, images, etc.)
- [x] 2.5 Create scraping progress tracking table
- [ ] 2.6 Generate and test database migrations

## 3. Scraping Infrastructure

- [x] 3.1 Set up HTTP client with rate limiting and retry logic
- [x] 3.2 Implement HTML parsing for whisky detail pages
- [x] 3.3 Create data extraction functions for each data field
- [x] 3.4 Implement data validation and sanitization
- [x] 3.5 Add error handling for missing/invalid data
- [x] 3.6 Implement raw data storage to disk (HTML format)
- [x] 3.7 Create directory structure for raw data files

## 4. Scraping Script

- [x] 4.1 Create main scraping script with sequential ID iteration starting from 1
- [x] 4.2 Implement 404 detection to terminate when end of entries is reached
- [x] 4.3 Implement progress tracking and checkpointing
- [x] 4.4 Add resumability (skip already-scraped whiskies)
- [x] 4.5 Implement logging and monitoring
- [x] 4.6 Add graceful shutdown handling

## 5. Testing & Validation

- [ ] 5.1 Test scraping on sample whisky pages
- [ ] 5.2 Validate data extraction accuracy
- [ ] 5.3 Test database insertions and schema constraints
- [ ] 5.4 Test raw data storage and file organization
- [ ] 5.5 Test error handling and edge cases
- [ ] 5.6 Test resumability and progress tracking
