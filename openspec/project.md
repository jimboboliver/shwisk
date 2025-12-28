# Project Context

## Purpose

shwisk is a mobile and web application that helps users identify good value whisky pours by analyzing whisky menu images and comparing pour prices against market data. The app allows users to:

- Select menu images from their device storage or capture new photos using their camera
- Extract whisky listings and pour prices from menu images using OCR
- Compare menu prices against current market/retail pricing data
- View value assessments overlaid directly on the menu image, indicating which pours represent good value

The dual-platform approach leverages mobile devices for convenient menu photography while providing web access for broader use cases. Results are presented as an overlay on the original menu image, allowing users to see value indicators directly on the menu items. The core value proposition is helping users make informed decisions when ordering whisky at bars and restaurants by identifying overpriced or underpriced pours.

## Tech Stack

### Frontend

- **React 19** - UI framework
- **Expo SDK 54** - Mobile app framework (React Native 0.81)
- **Next.js 15** - Web application framework
- **Expo Router** - File-based routing for mobile
- **NativeWind v5** - Tailwind CSS for React Native

### Styling

- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - UI component library

### Backend

- **tRPC v11** - End-to-end typesafe APIs
- **Node.js 22** - Runtime environment
- **Better Auth** - Authentication system

### Database

- **Drizzle ORM** - TypeScript ORM
- **Vercel Postgres** - Edge-compatible PostgreSQL (Supabase-compatible)
- **drizzle-zod** - Zod schema integration

### Monorepo & Tooling

- **Turborepo** - Monorepo build system
- **pnpm** - Package manager with workspaces
- **TypeScript** - Type-safe JavaScript
- **Zod** - Schema validation

### Packages

- `@acme/api` - tRPC router definitions
- `@acme/db` - Database client and schemas
- `@acme/auth` - Authentication configuration
- `@acme/ui` - Shared UI components
- `@acme/validators` - Shared validation schemas

## Project Conventions

### Code Style

- **Prettier** with automatic import sorting via `@ianvs/prettier-plugin-sort-imports`
- **Import order**: React → Next/Expo → Third-party → Workspace packages (`@acme/*`) → Local imports
- **Tailwind CSS** class sorting via `prettier-plugin-tailwindcss`
- **TypeScript strict mode** enabled
- **Consistent type imports**: Use separate type imports (`import type { ... }`) for type-only imports
- **ESLint** with TypeScript ESLint rules:
  - No unused variables (prefix with `_` to ignore)
  - Consistent type imports
  - No non-null assertions
  - Type-checked rules enabled

### Architecture Patterns

- **Monorepo structure** with clear package boundaries using Turborepo
- **tRPC for end-to-end type safety** between client and server
- **API package dependency strategy**:
  - Production dependency in server apps (Next.js)
  - Dev dependency in client apps (Expo) for type safety only
- **Shared packages** for cross-app code:
  - `@acme/api` - API definitions
  - `@acme/db` - Database access
  - `@acme/auth` - Authentication
  - `@acme/ui` - UI components
  - `@acme/validators` - Validation schemas
- **Edge-compatible database client** using Vercel Postgres driver
- **Environment variable validation** via `env.ts` files (no direct `process.env` access)
- **SuperJSON** for serialization of complex types in tRPC

### Testing Strategy

Testing approach to be determined. Will likely require:

- **Unit tests** for business logic and utilities
- **Integration tests** for API endpoints and database operations
- **E2E tests** for critical user flows, especially camera/image processing workflows
- **OCR accuracy testing** for menu text extraction

### Git Workflow

- **Feature branch workflow** - Create branches for features, bug fixes, etc.
- **Conventional commits** - To be established (likely using conventional commit format)
- **OpenSpec for change management** - Use OpenSpec proposals for significant changes, new features, and architectural decisions
- **Change proposals required for**:
  - New features or capabilities
  - Breaking changes (API, schema)
  - Architecture changes
  - Performance optimizations that change behavior
  - Security pattern updates

## Domain Context

### Whisky Menu Analysis

Users provide menu images (from camera or device storage) containing whisky listings with pour prices. The app must:

- Support image selection from device storage or camera capture
- Extract text from menu images using OCR
- Parse whisky names, ages, and pour prices
- Handle various menu formats and layouts
- Deal with poor image quality, lighting, and angles
- Present analysis results as an overlay on the original menu image, with value indicators positioned over corresponding menu items

### Market Data Comparison

Pour prices are compared against retail/market pricing data to determine value. This requires:

- Access to current whisky pricing data
- Matching menu items to known whisky products in the database
- Handling ambiguity in whisky naming (e.g., "Macallan 12" could refer to multiple variants)
- Calculating value metrics (e.g., price per pour vs. retail bottle price)

### Value Assessment

An algorithm determines if a pour represents good value by:

- Comparing menu pour price to market/retail pricing
- Considering typical markup expectations for bars/restaurants
- Providing clear value indicators (good value, fair, overpriced)

### Whisky Identification

The system must:

- Match menu text to known whiskies in a product database
- Handle variations in naming conventions
- Resolve ambiguities when multiple whiskies match a menu description
- Support user correction when automatic identification fails

## Important Constraints

### Technical Constraints

- **Image source access**: Requires camera permissions and/or storage/media library permissions on mobile devices for image selection
- **Image processing**: OCR accuracy is critical for reliable menu text extraction
- **Market data availability**: Need reliable, up-to-date whisky pricing data source
- **Whisky identification ambiguity**: Menu naming may be ambiguous (e.g., "Macallan 12" could be multiple variants)
- **Offline capability**: Consider offline functionality for mobile app to work without network connectivity
- **Image processing performance**: OCR and image analysis must be performant on mobile devices
- **Overlay rendering**: Must accurately position value indicators over corresponding menu items on the image, handling various image sizes and aspect ratios

### Business Constraints

- **Privacy concerns**: Menu photos may contain sensitive information (other menu items, prices, etc.)
- **Data accuracy**: Market pricing data must be current and accurate for value assessments to be meaningful
- **User trust**: Incorrect value assessments could damage user trust

### Regulatory Constraints

- **Media permissions**: Must comply with platform-specific camera and storage/media library permission requirements
- **Data privacy**: Menu images and user data must be handled according to privacy regulations (GDPR, etc.)

## External Dependencies

### Market Data API

Whisky pricing database/service (to be selected). Requirements:

- Current retail/market pricing for whiskies
- Coverage of major whisky brands and expressions
- Regular updates to reflect market changes
- API access for programmatic queries

### OCR Service

Image-to-text extraction service for menu photographs. Options include:

- **Google Cloud Vision API** - High accuracy, cloud-based
- **Tesseract OCR** - Open source, can run client-side or server-side
- **Specialized menu OCR services** - May offer better accuracy for menu-specific layouts

### Whisky Database

Product catalog for matching menu items to known whiskies. Requirements:

- Comprehensive whisky product database
- Standardized naming conventions
- Metadata (brand, age, region, etc.) for matching
- Support for variant identification

### Image Storage (Optional)

Cloud storage for menu photos if server-side processing is required:

- May be optional if OCR processing happens client-side
- Could use services like Cloudinary, AWS S3, or similar
- Must consider privacy and data retention policies
