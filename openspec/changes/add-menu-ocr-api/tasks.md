## 1. Implementation

- [x] 1.1 Install AWS SDK for Textract (`@aws-sdk/client-textract`)
- [x] 1.2 Configure AWS credentials and region in environment variables
- [x] 1.3 Create tRPC router for menu OCR (`packages/api/src/router/menu-ocr.ts`)
- [x] 1.4 Implement image upload/processing procedure that accepts image data
- [x] 1.5 Integrate Amazon Textract to extract text and bounding boxes from menu images
- [x] 1.6 Install OpenAI SDK for embeddings generation
- [x] 1.7 Configure OpenAI API key in environment variables
- [x] 1.8 Implement vector embedding generation for extracted menu text using OpenAI
- [x] 1.9 Implement whisky vector search using pgvector cosine similarity against whisky embeddings
- [x] 1.10 Implement fallback text-based search for cases where embeddings unavailable
- [x] 1.11 Add similarity score threshold configuration for vector search results
- [x] 1.12 Implement bottle size parsing utility (extract ml from "700ml", "750ml" format)
- [x] 1.13 Implement pour price prediction algorithm (bottle price → pour price calculation using actual bottle size)
- [x] 1.14 Implement value assessment logic (compare extracted price vs predicted price, classify as good/fair/overpriced)
- [x] 1.15 Structure response format with Textract data, matched whiskies, predicted prices, similarity scores, and value assessments
- [x] 1.16 Add input validation for image format and size constraints
- [x] 1.17 Add error handling for Textract API failures, OpenAI API failures, and database query errors

## 2. Testing

- [ ] 2.1 Test API endpoint with sample menu images
- [ ] 2.2 Verify Textract extraction accuracy for various menu formats
- [ ] 2.3 Test whisky vector search matching accuracy with various naming conventions and abbreviations (e.g., "12YO" vs "12 year old")
- [ ] 2.3.1 Test similarity score thresholds and ranking
- [ ] 2.3.2 Test fallback to text search when embeddings unavailable
- [ ] 2.4 Validate bottle size parsing with various formats (700ml, 750ml, etc.)
- [ ] 2.5 Validate pour price prediction calculations using actual bottle sizes
- [ ] 2.6 Test value assessment logic with various price comparisons
- [ ] 2.7 Test error handling for invalid images, API failures, and edge cases

## 3. Documentation

- [ ] 3.1 Document API endpoint usage and request/response formats
- [ ] 3.2 Document pour price prediction algorithm assumptions and bottle size parsing
- [ ] 3.3 Document value assessment thresholds and classification logic
- [ ] 3.4 Document AWS Textract configuration requirements
- [ ] 3.5 Document OpenAI embeddings API configuration and usage
- [ ] 3.6 Document vector search similarity thresholds and matching strategy
