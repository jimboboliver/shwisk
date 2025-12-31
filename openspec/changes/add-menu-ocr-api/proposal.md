# Change: Add Menu OCR API with Price Prediction

## Why

Users need to analyze whisky menu images to identify good value pours. The application must extract whisky listings and prices from menu images using OCR, match them to known whiskies in the database, and calculate predicted pour prices. This enables clients to compare extracted prices against predicted prices to assess value. Amazon Textract provides high-accuracy OCR with spatial information (bounding boxes) that allows precise positioning of value indicators on the menu image.

## What Changes

- **ADDED**: tRPC API endpoint that accepts whisky menu images and returns Amazon Textract results with whisky item locations
- **ADDED**: Whisky database search functionality using vector/semantic search to match extracted text to known whisky products (e.g., "Auchroisk 12YO" → "Auchroisk 12 year old")
- **ADDED**: Vector embedding generation for menu text using OpenAI embeddings API
- **ADDED**: Pour price prediction algorithm that calculates expected pour prices based on bottle retail/market prices and actual bottle sizes from the database
- **ADDED**: Server-side value assessment that compares extracted menu prices to predicted pour prices and classifies items as good value, fair, or overpriced
- **ADDED**: Integration with Amazon Textract service for OCR text extraction and spatial data
- **ADDED**: Integration with OpenAI embeddings API for semantic whisky matching
- **ADDED**: Response format that includes Textract bounding boxes, extracted text, matched whiskies, predicted pour prices, and value assessments

## Impact

- Affected specs: New capability `menu-ocr-api`
- Affected code:
  - `packages/api/src/router/` - New tRPC router for menu OCR
  - `packages/api/src/` - AWS Textract integration, OpenAI embeddings integration, and whisky vector search logic
  - `packages/db/src/` - Vector search queries using pgvector (whisky embeddings already exist in schema)
  - Environment configuration - AWS credentials and region for Textract, OpenAI API key for embeddings
  - Package dependencies - AWS SDK for Textract, OpenAI SDK for embeddings
