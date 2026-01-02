## ADDED Requirements

### Requirement: Whisky Product Data Storage

The system SHALL store comprehensive whisky product information extracted from Whiskystats.com, including identification, classification, production details, and physical characteristics.

#### Scenario: Store basic whisky information

- **WHEN** a whisky page is successfully scraped
- **THEN** the system stores whisky ID, name, category, distillery, bottler, bottling series, vintage, bottled date, stated age, cask type, strength, size, barcode, and whisky group ID

#### Scenario: Store optional whisky metadata

- **WHEN** a whisky page contains optional metadata
- **THEN** the system stores flags (uncolored, non-chillfiltered, cask strength), number of bottles, and image URLs when available

### Requirement: Pricing Data Storage

The system SHALL store historical pricing information for whiskies, including market values and retail prices with associated timestamps.

#### Scenario: Store market value data

- **WHEN** a whisky page contains market value information
- **THEN** the system stores the market value amount, currency, and date of the value

#### Scenario: Store retail price data

- **WHEN** a whisky page contains retail price information
- **THEN** the system stores the retail price amount, currency, and date of the price

#### Scenario: Handle missing pricing data

- **WHEN** a whisky page does not contain pricing information
- **THEN** the system records the absence of pricing data without error

### Requirement: Ratings Data Storage

The system SHALL store whisky ratings and rating counts extracted from Whiskystats.com.

#### Scenario: Store rating information

- **WHEN** a whisky page contains rating data
- **THEN** the system stores the average rating score and total number of ratings

#### Scenario: Handle missing ratings

- **WHEN** a whisky page does not contain rating information
- **THEN** the system records null values for rating fields without error

### Requirement: Web Scraping Functionality

The system SHALL provide functionality to scrape whisky data from Whiskystats.com pages systematically.

#### Scenario: Scrape individual whisky page

- **WHEN** provided with a valid whisky ID
- **THEN** the system fetches the page, parses the HTML, extracts all available data fields, stores them in the database, and saves the raw data to disk

#### Scenario: Detect end of available entries

- **WHEN** a whisky ID returns a 404 HTTP status code
- **THEN** the system recognizes this as the end of available entries and terminates scraping

#### Scenario: Handle non-existent whisky IDs

- **WHEN** a whisky ID does not exist or returns an error page (non-404)
- **THEN** the system logs the error and continues processing without crashing

#### Scenario: Handle rate limiting

- **WHEN** making requests to Whiskystats.com
- **THEN** the system implements configurable delays between requests and exponential backoff on errors

### Requirement: Long-Running Scraping Script

The system SHALL provide a script capable of processing all available whisky entries in a single execution, automatically discovering the full range of entries.

#### Scenario: Process all available entries

- **WHEN** the scraping script is executed
- **THEN** it iterates through whisky IDs starting from 1, scraping each page and storing the data, continuing until a 404 error is encountered

#### Scenario: Resume from checkpoint

- **WHEN** the scraping script is interrupted and restarted
- **THEN** it resumes from the last successfully processed ID, skipping already-scraped entries

#### Scenario: Track scraping progress

- **WHEN** processing whisky entries
- **THEN** the system maintains a record of the last processed ID and scraping status

#### Scenario: Handle scraping errors gracefully

- **WHEN** an error occurs during scraping (network failure, parsing error, etc.)
- **THEN** the system logs the error, records the failed ID, and continues processing subsequent entries

### Requirement: Data Validation

The system SHALL validate scraped data before storing it in the database.

#### Scenario: Validate required fields

- **WHEN** scraping a whisky page
- **THEN** the system validates that required fields (whisky ID, name) are present before database insertion

#### Scenario: Sanitize data types

- **WHEN** extracting numeric fields (age, strength, price, etc.)
- **THEN** the system converts string values to appropriate numeric types and handles parsing errors

#### Scenario: Handle malformed data

- **WHEN** scraped data does not match expected format
- **THEN** the system logs a warning, attempts to extract available valid data, and stores partial records when appropriate

### Requirement: Raw Data Storage

The system SHALL store raw scraped HTML data on disk for backup, debugging, and re-processing purposes.

#### Scenario: Store raw HTML for each whisky

- **WHEN** a whisky page is successfully scraped
- **THEN** the system saves the raw HTML content to disk, organized by whisky ID

#### Scenario: Organize raw data files

- **WHEN** storing raw data files
- **THEN** the system organizes files in a directory structure that allows easy lookup by whisky ID (e.g., `C:/Users/james/Downloads/data/whisky/{id}.html`)

#### Scenario: Handle raw data storage errors

- **WHEN** disk storage fails for raw data
- **THEN** the system logs the error but continues processing and database storage (raw data storage is non-blocking)
