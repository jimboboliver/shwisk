## ADDED Requirements

### Requirement: Menu Image OCR Processing

The system SHALL accept whisky menu images and extract text content with spatial information using Amazon Textract.

#### Scenario: Successful OCR extraction

- **WHEN** a valid menu image is provided to the OCR API endpoint
- **THEN** the system SHALL return Amazon Textract results containing extracted text blocks with bounding box coordinates
- **AND** the response SHALL include all detected text elements with their spatial positions on the image

#### Scenario: Invalid image format

- **WHEN** an invalid or unsupported image format is provided
- **THEN** the system SHALL return an error indicating the image format is not supported
- **AND** the error SHALL specify the required image formats

#### Scenario: Image size exceeds limit

- **WHEN** an image exceeds the maximum allowed size
- **THEN** the system SHALL return an error indicating the image is too large
- **AND** the error SHALL specify the maximum allowed image size

### Requirement: Whisky Database Matching

The system SHALL match extracted text from menu images to known whisky products in the database using vector/semantic search.

#### Scenario: Successful whisky match using vector search

- **WHEN** extracted text contains a whisky name (e.g., "Auchroisk 12YO") that semantically matches a database record (e.g., "Auchroisk 12 year old")
- **THEN** the system SHALL generate an embedding for the extracted text using OpenAI embeddings API
- **AND** the system SHALL query the database using pgvector cosine similarity search
- **AND** the system SHALL return the matched whisky with its database ID and metadata
- **AND** the match SHALL include similarity score (cosine similarity) for ranking

#### Scenario: Multiple potential matches with similarity scores

- **WHEN** extracted text matches multiple whisky records in the database via vector search
- **THEN** the system SHALL return all potential matches ranked by similarity score (highest first)
- **AND** each match SHALL include similarity score and sufficient metadata for client-side disambiguation
- **AND** matches below a configurable similarity threshold SHALL be excluded

#### Scenario: No match found

- **WHEN** extracted text does not match any whisky in the database (all similarity scores below threshold)
- **THEN** the system SHALL indicate no match was found
- **AND** the response SHALL still include the extracted text for client-side handling

#### Scenario: Fallback to text search

- **WHEN** vector search fails (e.g., OpenAI API unavailable, no embeddings in database)
- **THEN** the system SHALL fallback to text-based fuzzy matching
- **AND** the system SHALL return matches using text search as a secondary method

### Requirement: Pour Price Prediction

The system SHALL calculate predicted pour prices for matched whiskies based on bottle prices and actual bottle sizes from the database.

#### Scenario: Price prediction from retail price with actual bottle size

- **WHEN** a matched whisky has a retail price and bottle size in the database
- **THEN** the system SHALL calculate a predicted pour price using the retail price and actual bottle size
- **AND** the calculation SHALL parse the bottle size (e.g., "700ml", "750ml") to determine pours per bottle
- **AND** the calculation SHALL use a configurable markup factor and standard pour size (1.5oz / 44ml)

#### Scenario: Price prediction from market value with actual bottle size

- **WHEN** a matched whisky has no retail price but has a market value and bottle size
- **THEN** the system SHALL calculate a predicted pour price using the market value and actual bottle size
- **AND** the calculation SHALL use the same markup factor and pour size assumptions

#### Scenario: Price prediction with unparseable bottle size

- **WHEN** a matched whisky has a price but the bottle size cannot be parsed
- **THEN** the system SHALL default to 750ml for the calculation
- **AND** the system SHALL log the parsing failure for monitoring

#### Scenario: Missing price data

- **WHEN** a matched whisky has no retail price or market value in the database
- **THEN** the system SHALL indicate that price prediction is unavailable
- **AND** the response SHALL still include the matched whisky data without predicted price

### Requirement: Value Assessment Calculation

The system SHALL perform server-side value assessment by comparing extracted menu pour prices to predicted pour prices.

#### Scenario: Value assessment for good value

- **WHEN** the extracted menu pour price is significantly below the predicted pour price (e.g., >10% below)
- **THEN** the system SHALL classify the item as "good value"
- **AND** the response SHALL include the value assessment classification

#### Scenario: Value assessment for fair price

- **WHEN** the extracted menu pour price is within an acceptable range of the predicted pour price (e.g., within ±10%)
- **THEN** the system SHALL classify the item as "fair"
- **AND** the response SHALL include the value assessment classification

#### Scenario: Value assessment for overpriced

- **WHEN** the extracted menu pour price is significantly above the predicted pour price (e.g., >10% above)
- **THEN** the system SHALL classify the item as "overpriced"
- **AND** the response SHALL include the value assessment classification

#### Scenario: Value assessment with missing extracted price

- **WHEN** OCR processing detects a whisky item but cannot extract a price from the menu
- **THEN** the system SHALL indicate that value assessment is unavailable
- **AND** the response SHALL still include the matched whisky data and predicted price

#### Scenario: Value assessment with missing predicted price

- **WHEN** a matched whisky has no price data in the database
- **THEN** the system SHALL indicate that value assessment is unavailable
- **AND** the response SHALL include the extracted price (if available) but no predicted price

### Requirement: OCR API Response Format

The system SHALL return a structured response containing Textract data, matched whiskies, predicted prices, and value assessments for each detected menu item.

#### Scenario: Complete response with matches and value assessments

- **WHEN** OCR processing completes successfully and matches are found
- **THEN** the response SHALL include:
  - **AND** Textract text blocks with bounding box coordinates for each detected text element
  - **AND** Matched whisky records with database IDs and metadata for each detected whisky item
  - **AND** Predicted pour prices for each matched whisky (calculated using actual bottle size)
  - **AND** Extracted pour prices from the menu (if detected)
  - **AND** Value assessment classifications (good value, fair, overpriced, or unavailable)
  - **AND** Extracted text content for each menu item

#### Scenario: Response with partial matches

- **WHEN** OCR processing completes but only some items match whiskies in the database
- **THEN** the response SHALL include matched items with predictions and value assessments
- **AND** unmatched items SHALL include extracted text and bounding boxes only
- **AND** the response SHALL clearly distinguish between matched and unmatched items

#### Scenario: Response format structure

- **WHEN** the API returns a successful response
- **THEN** the response SHALL be structured as an array of menu items
- **AND** each menu item SHALL contain:
  - Textract bounding box coordinates
  - Extracted text content
  - Extracted pour price (if detected)
  - Matched whisky data (if found)
  - Predicted pour price (if available, calculated using actual bottle size)
  - Value assessment classification (if both extracted and predicted prices are available)
  - Match confidence/ranking information (similarity scores for vector search matches)
