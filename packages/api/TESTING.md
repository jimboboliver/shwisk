# Testing the Menu OCR API

This guide explains how to test the `menuOcr.processMenu` tRPC endpoint.

## Prerequisites

1. **AWS Credentials**: Set up AWS credentials for Textract access

   ```bash
   export AWS_ACCESS_KEY_ID=your-access-key
   export AWS_SECRET_ACCESS_KEY=your-secret-key
   export AWS_REGION=us-east-1  # or your preferred region
   ```

2. **Running Server**: Make sure your Next.js app is running

   ```bash
   pnpm dev:next
   # or
   cd apps/nextjs && pnpm dev
   ```

3. **Database**: Ensure your database has whisky data populated

## Method 1: Using the Test Script (Recommended)

A test script is provided at `packages/api/src/test-menu-ocr.ts`:

```bash
# Test with an image file
pnpm tsx packages/api/src/test-menu-ocr.ts path/to/menu-image.jpg

# Test with base64 string
pnpm tsx packages/api/src/test-menu-ocr.ts --base64 <base64-string> --type image/jpeg

# Use a different API URL
API_URL=http://localhost:3000/api/trpc pnpm tsx packages/api/src/test-menu-ocr.ts menu.jpg
```

The script will:

- Convert the image to base64
- Call the API endpoint
- Display extracted text blocks
- Show whisky matches and value assessments
- Print a summary of results

## Method 2: Using tRPC Client in Code

### In Next.js (Server Component)

```typescript
import { trpc } from "~/trpc/server";

export default async function TestPage() {
  const imageBase64 = "..." // your base64 image
  const result = await trpc.menuOcr.processMenu({
    image: imageBase64,
    imageType: "image/jpeg",
    markupFactor: 2.5,
  });

  return <pre>{JSON.stringify(result, null, 2)}</pre>;
}
```

### In Next.js (Client Component)

```typescript
"use client";
import { useTRPC } from "~/trpc/react";

export function MenuOcrTest() {
  const { mutate } = useTRPC.menuOcr.processMenu.useMutation();

  const handleTest = () => {
    mutate({
      image: "base64-image-string",
      imageType: "image/jpeg",
      markupFactor: 2.5,
    }, {
      onSuccess: (data) => {
        console.log("Success:", data);
      },
      onError: (error) => {
        console.error("Error:", error);
      },
    });
  };

  return <button onClick={handleTest}>Test OCR</button>;
}
```

## Method 3: Using HTTP/curl

Since tRPC uses HTTP POST, you can test it directly:

```bash
curl -X POST http://localhost:3000/api/trpc/menuOcr.processMenu \
  -H "Content-Type: application/json" \
  -H "x-trpc-source: curl" \
  -d '{
    "0": {
      "json": {
        "image": "base64-encoded-image-string",
        "imageType": "image/jpeg",
        "markupFactor": 2.5
      }
    }
  }'
```

Note: tRPC uses a specific request format. The test script (Method 1) is easier.

## Method 4: Using Postman/Insomnia

1. Set method to `POST`
2. URL: `http://localhost:3000/api/trpc/menuOcr.processMenu`
3. Headers:
   - `Content-Type: application/json`
   - `x-trpc-source: postman`
4. Body (raw JSON):

```json
{
  "0": {
    "json": {
      "image": "your-base64-image-string",
      "imageType": "image/jpeg",
      "markupFactor": 2.5
    }
  }
}
```

## Converting Images to Base64

### Using Node.js

```javascript
const fs = require("fs");
const imageBuffer = fs.readFileSync("menu.jpg");
const base64 = imageBuffer.toString("base64");
console.log(base64);
```

### Using Browser

```javascript
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const reader = new FileReader();
reader.onload = (e) => {
  const base64 = e.target.result.split(",")[1]; // Remove data URL prefix
  console.log(base64);
};
reader.readAsDataURL(file);
```

### Using Command Line (Linux/Mac)

```bash
base64 -i menu.jpg | tr -d '\n'
```

## Expected Response Format

```typescript
{
  textBlocks: Array<{
    text: string;
    boundingBox: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  }>;
  menuItems: Array<{
    text: string;
    boundingBox: { left; top; width; height };
    extractedPrice: number | null;
    matches: Array<{
      whiskyId: number;
      whiskyDbId: string;
      name: string | null;
      distillery: string | null;
      category: string | null;
      bottleSize: string | null;
      bottlePrice: number | null;
      predictedPourPrice: number | null;
      valueAssessment: "good_value" | "fair" | "overpriced" | "unavailable";
    }>;
  }>;
}
```

## Troubleshooting

### "Failed to process image with OCR"

- Check AWS credentials are set correctly
- Verify AWS_REGION is set
- Ensure Textract service is available in your region
- Check image size (max 5MB)

### "Invalid base64 image data"

- Make sure the base64 string is valid
- Remove data URL prefix if present (`data:image/jpeg;base64,`)

### "Image size exceeds maximum"

- Compress or resize the image
- Maximum size is 5MB

### No whisky matches found

- Check that your database has whisky data
- Verify the extracted text contains whisky names
- Try adjusting the search text or adding more whisky data

## Testing Different Scenarios

1. **Good Value Detection**: Use a menu with prices significantly below predicted prices
2. **Overpriced Detection**: Use a menu with prices above predicted prices
3. **No Matches**: Use a menu with whiskies not in your database
4. **Multiple Matches**: Use a menu with ambiguous whisky names
5. **Missing Prices**: Use a menu where OCR doesn't extract prices
