## Context

The application needs to process whisky menu images to extract whisky listings and prices, match them to known products in the database, and provide predicted pour prices for value comparison. Amazon Textract is chosen for OCR because it provides both text extraction and spatial information (bounding boxes) that enables precise overlay positioning on the original image.

## Goals / Non-Goals

### Goals

- Extract text and spatial data from menu images using Amazon Textract
- Match extracted whisky names to database records
- Calculate predicted pour prices based on bottle prices and actual bottle sizes
- Perform server-side value assessment comparing extracted menu prices to predicted prices
- Return structured data with value assessments for client-side display

### Non-Goals

- Image storage or persistence (images processed on-demand)
- Real-time price updates (uses existing database pricing data)
- Multi-language menu support (English only initially)

## Decisions

### Decision: Use Amazon Textract for OCR

**Rationale**: Amazon Textract provides high-accuracy OCR with spatial information (bounding boxes) that is essential for positioning value indicators on menu images. It handles various image qualities and formats well, and integrates easily with AWS infrastructure.

**Alternatives considered**:

- Google Cloud Vision API: Similar capabilities but requires different cloud provider setup
- Tesseract OCR: Open source but requires more preprocessing and doesn't provide as reliable spatial data
- Specialized menu OCR services: May not exist or may be cost-prohibitive

### Decision: Server-side OCR processing

**Rationale**: Textract requires AWS credentials and API calls that should not be exposed client-side. Server-side processing also allows for better error handling, rate limiting, and cost control.

**Alternatives considered**:

- Client-side OCR: Would require exposing AWS credentials or using alternative client-side solutions with lower accuracy

### Decision: Server-side value assessment

**Rationale**: Value calculation logic is centralized on the server to ensure consistency across all clients. The API performs the comparison between extracted menu prices and predicted pour prices, returning value assessments (good value, fair, overpriced) along with the underlying data. This keeps business logic server-side and ensures consistent value calculations regardless of client implementation.

**Alternatives considered**:

- Client-side value assessment: Would duplicate business logic across clients and risk inconsistencies
- Return only predicted prices: Would require clients to implement value logic, reducing consistency

### Decision: Pour price prediction algorithm

**Rationale**: Calculate predicted pour price based on bottle retail/market price using standard industry markup assumptions. The calculation uses the actual bottle size from the database (e.g., "700ml", "750ml") rather than assuming a standard size. Typical pour is 1.5oz (44ml). Markup typically ranges from 2-4x retail price for bars/restaurants.

**Formula**: `predictedPourPrice = (bottlePrice / poursPerBottle) * markupFactor`

Where:

- `bottlePrice`: Retail price or market value from database
- `poursPerBottle`: Calculated from actual bottle size (e.g., 700ml / 44ml ≈ 15.9 pours, 750ml / 44ml ≈ 17 pours)
- `markupFactor`: Configurable multiplier (default 2.5x for typical markup)

**Bottle size parsing**: Extract volume in milliliters from the `size` field (e.g., "700ml" → 700, "750ml" → 750). Default to 750ml if size cannot be parsed.

**Alternatives considered**:

- Fixed 750ml assumption: Less accurate for non-standard bottle sizes
- Fixed markup percentage: Less flexible than configurable factor
- Machine learning model: Overkill for initial implementation, requires training data

### Decision: Whisky matching strategy using vector search

**Rationale**: Use vector/semantic search to match extracted menu text to database records. This enables matching variations like "Auchroisk 12YO" to "Auchroisk 12 year old" by understanding semantic similarity rather than requiring exact text matches. The database already has pgvector support and embedding fields in the whisky schema. OpenAI embeddings provide high-quality semantic matching that handles abbreviations, formatting differences, and common variations.

**Implementation approach**:

1. Generate embedding for extracted menu text using OpenAI embeddings API
2. Query database using pgvector cosine similarity search against whisky embeddings
3. Return top matches ranked by similarity score
4. Fallback to text-based search if embeddings are unavailable or as a secondary search method

**Alternatives considered**:

- Text-based fuzzy matching: Less accurate for handling abbreviations and variations (e.g., "12YO" vs "12 year old")
- Exact string matching: Too strict, would miss many valid matches
- Hybrid approach (vector + text): Considered but vector search alone should be sufficient for most cases
- User disambiguation: Deferred to client-side for initial version

## Risks / Trade-offs

### Risk: Textract API costs

**Mitigation**: Monitor usage, implement rate limiting, consider caching for repeated images

### Risk: Whisky matching accuracy

**Mitigation**: Use vector/semantic search for better matching of variations and abbreviations. Return multiple match candidates with similarity scores, allow client-side disambiguation. Fallback to text-based search if embeddings unavailable.

### Risk: Price prediction accuracy

**Mitigation**: Use configurable markup factors, document assumptions, use actual bottle sizes from database

### Risk: Bottle size parsing errors

**Mitigation**: Implement robust parsing with fallback to default 750ml, log parsing failures for monitoring

### Risk: Image size/format constraints

**Mitigation**: Validate inputs, provide clear error messages, document supported formats

### Trade-off: Processing time vs. accuracy

- Textract may take several seconds for complex images
- Acceptable for on-demand analysis use case
- Consider async processing if response times become problematic

## Migration Plan

N/A - This is a new feature with no existing functionality to migrate.

## Open Questions

- Should we cache Textract results for identical images?
- Should we cache OpenAI embeddings for common menu text patterns?
- What markup factor should be used as default? (2.5x suggested)
- Should we support multiple currencies or normalize to a single currency?
- How should we handle whiskies with multiple pricing entries (retail vs market value)?
- Should we implement rate limiting per user/IP?
- What value thresholds define "good value", "fair", and "overpriced"? (e.g., within 10% = fair, >10% below = good value, >10% above = overpriced)
- What similarity threshold should be used for vector search matches? (e.g., minimum cosine similarity score)
- Should we use a hybrid approach (vector + text search) or vector search only?
