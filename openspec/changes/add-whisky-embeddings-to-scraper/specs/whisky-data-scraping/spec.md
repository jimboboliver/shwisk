## MODIFIED Requirements

### Requirement: Whisky Product Data Storage

The system SHALL store comprehensive whisky product information extracted from Whiskystats.com, including identification, classification, production details, physical characteristics, and vector embeddings for semantic search.

#### Scenario: Store basic whisky information

- **WHEN** a whisky page is successfully scraped
- **THEN** the system stores whisky ID, name, category, distillery, bottler, bottling series, vintage, bottled date, stated age, cask type, strength, size, barcode, whisky group ID, and vector embedding

#### Scenario: Store optional whisky metadata

- **WHEN** a whisky page contains optional metadata
- **THEN** the system stores flags (uncolored, non-chillfiltered, cask strength), number of bottles, and image URLs when available

#### Scenario: Generate and store vector embeddings

- **WHEN** a whisky is successfully scraped and stored
- **THEN** the system generates a vector embedding from the whisky's distillery, vintage/stated age, bottling series, and label fields using OpenAI embeddings API (format: `{distillery} {vintage??stated_age}{stated_age_used ? ' years old' : ''} {bottling_series}{label? ' {label}' : ''}`), stores it in the embedding field, and saves it locally as a JSON file alongside the raw HTML data

#### Scenario: Load existing embeddings from disk

- **WHEN** a whisky is being processed and a local embedding file exists
- **THEN** the system loads the embedding from disk instead of generating a new one, avoiding unnecessary API calls

#### Scenario: Handle embedding generation failures

- **WHEN** embedding generation fails (e.g., OpenAI API unavailable, rate limited)
- **THEN** the system logs the error, stores the whisky record without an embedding, and continues processing subsequent records

### Requirement: Raw Data Storage

The system SHALL store raw scraped HTML data on disk for backup, debugging, and re-processing purposes.

#### Scenario: Store raw HTML for each whisky

- **WHEN** a whisky page is successfully scraped
- **THEN** the system saves the raw HTML content to disk, organized by whisky ID

#### Scenario: Organize raw data files

- **WHEN** storing raw data files
- **THEN** the system organizes files in a directory structure that allows easy lookup by whisky ID (e.g., `C:/Users/james/Downloads/data/whisky/{id}.html`)

#### Scenario: Store embeddings alongside raw data

- **WHEN** an embedding is generated for a whisky
- **THEN** the system saves the embedding as a JSON file in the same directory as the raw HTML (e.g., `C:/Users/james/Downloads/data/whisky/{id}.embedding.json`)

#### Scenario: Handle raw data storage errors

- **WHEN** disk storage fails for raw data or embeddings
- **THEN** the system logs the error but continues processing and database storage (raw data storage is non-blocking)
