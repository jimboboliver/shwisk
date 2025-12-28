import { promises as fs } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";

import type {
  PricingData,
  RatingData,
  ScrapedWhiskyData,
  WhiskyData,
} from "./types";

export interface ScraperConfig {
  baseUrl?: string;
  rateLimitDelay?: number; // milliseconds between requests
  rawDataDir?: string; // directory to store raw HTML files
  userAgent?: string;
}

const DEFAULT_CONFIG: Required<ScraperConfig> = {
  baseUrl: "https://www.whiskystats.com",
  rateLimitDelay: 2000, // 2 seconds
  rawDataDir: "./data/whisky",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

export class WhiskyScraper {
  private config: Required<ScraperConfig>;
  private lastRequestTime = 0;

  constructor(config: ScraperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Fetches a whisky page and returns the HTML content
   */
  async fetchWhiskyPage(whiskyId: number): Promise<string> {
    // First, try to read from disk if the file exists
    const filePath = join(this.config.rawDataDir, `${whiskyId}.html`);
    try {
      const html = await fs.readFile(filePath, "utf-8");
      // Check if the HTML is actually a 404 page
      if (this.is404Page(html)) {
        throw new Error("NOT_FOUND");
      }
      return html;
    } catch (error) {
      // If it's a NOT_FOUND error, re-throw it
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw error;
      }
      // File doesn't exist or other error, proceed with HTTP request
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.rateLimitDelay) {
      const delay = this.config.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const url = `${this.config.baseUrl}/whisky/${whiskyId}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    this.lastRequestTime = Date.now();

    const html = await response.text();

    // Save to disk for future use (including 404 pages so we don't re-request them)
    await this.saveRawData(whiskyId, html);

    if (response.status === 404) {
      throw new Error("NOT_FOUND");
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return html;
  }

  /**
   * Checks if HTML content is a 404 error page
   */
  private is404Page(html: string): boolean {
    // Check for common 404 indicators
    // If the page doesn't contain the expected Vue component attribute, it might be a 404
    const hasWhiskyAttribute =
      html.includes(':whisky="') || html.includes(':bottle="');
    if (!hasWhiskyAttribute) {
      // Check for explicit 404 indicators
      if (
        /404|not found|page not found/i.test(html) ||
        !/WB\d+/.test(html) // No whisky ID pattern found
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Parses HTML content and extracts whisky data
   */
  parseWhiskyPage(html: string, whiskyId: number): ScrapedWhiskyData | null {
    const $ = cheerio.load(html);

    // Extract JSON data from Vue component attribute first
    const jsonData = this.extractJsonData(html);
    if (!jsonData) {
      // Check if this is a 404 page
      if (this.is404Page(html)) {
        throw new Error("NOT_FOUND");
      }
      return null; // Could not extract JSON data
    }

    // Extract whisky ID from JSON data for verification
    // But always use the whiskyId parameter as the source of truth for the database
    const jsonWbid =
      typeof jsonData.wbid === "number"
        ? jsonData.wbid
        : typeof jsonData.id === "number"
          ? jsonData.id
          : whiskyId;

    // Verify the JSON wbid matches the expected whiskyId (sanity check)
    if (jsonWbid !== whiskyId) {
      // Log warning but continue - sometimes the JSON might have a different ID
      console.warn(
        `Whisky ID mismatch: expected ${whiskyId}, got ${jsonWbid} from JSON. Using ${whiskyId} as whisky_id.`,
      );
    }

    // Always use the whiskyId parameter (from URL) as the source of truth
    // This ensures whisky_id in the database matches the ID we're scraping
    const whiskyIdText = `WB${whiskyId}`;

    // Extract name from JSON (fallback to h1 if not found)
    const name =
      typeof jsonData.name === "string"
        ? jsonData.name
        : $("h1").first().text().trim() || "";

    // Extract category from type
    let category: string | undefined;
    if (
      typeof jsonData.type === "object" &&
      jsonData.type !== null &&
      "name" in jsonData.type
    ) {
      const typeName = (jsonData.type as { name: unknown }).name;
      if (typeof typeName === "string") {
        category = typeName;
      }
    }

    // Extract distillery from distilleries array
    let distillery: string | undefined;
    if (
      Array.isArray(jsonData.distilleries) &&
      jsonData.distilleries.length > 0
    ) {
      const firstDistillery = jsonData.distilleries[0] as unknown;
      if (
        typeof firstDistillery === "object" &&
        firstDistillery !== null &&
        "name" in firstDistillery
      ) {
        const distilleryName = (firstDistillery as { name: unknown }).name;
        if (typeof distilleryName === "string") {
          distillery = distilleryName;
        }
      }
    }

    // Extract bottler from original_bottling, mapping.basket.bottler, or simple_bottler
    // Check original_bottling first - if true, it's always a distillery bottling
    let bottler: string | undefined;
    const bottle = jsonData.bottle;
    if (
      typeof bottle === "object" &&
      bottle !== null &&
      "original_bottling" in bottle
    ) {
      const originalBottling = (bottle as { original_bottling: unknown })
        .original_bottling;
      if (originalBottling === true) {
        bottler = "Distillery Bottling";
      }
    }
    // If not a distillery bottling, check mapping.basket.bottler (most reliable)
    if (!bottler) {
      const mapping = jsonData.mapping;
      if (
        typeof mapping === "object" &&
        mapping !== null &&
        "basket" in mapping
      ) {
        const basket = (mapping as { basket: unknown }).basket;
        if (
          typeof basket === "object" &&
          basket !== null &&
          "bottler" in basket
        ) {
          const bottlerValue = (basket as { bottler: unknown }).bottler;
          if (typeof bottlerValue === "string" && bottlerValue) {
            bottler = bottlerValue;
          }
        }
      }
    }
    // Fallback to bottler.name if not found in basket
    if (!bottler) {
      const bottlerObj = jsonData.bottler;
      if (
        typeof bottlerObj === "object" &&
        bottlerObj !== null &&
        "name" in bottlerObj
      ) {
        const bottlerName = (bottlerObj as { name: unknown }).name;
        if (typeof bottlerName === "string" && bottlerName) {
          bottler = bottlerName;
        }
      }
    }
    // Final fallback to simple_bottler
    if (!bottler) {
      const simpleBottler = jsonData.simple_bottler;
      if (typeof simpleBottler === "string" && simpleBottler) {
        bottler = simpleBottler;
      }
    }

    // Extract bottling series from serie
    const bottlingSeries =
      typeof jsonData.serie === "object" &&
      jsonData.serie !== null &&
      "name" in jsonData.serie &&
      typeof jsonData.serie.name === "string"
        ? jsonData.serie.name
        : undefined;

    // Extract vintage (distillation date) - prioritize vintage over bottle_date
    const vintage =
      typeof jsonData.vintage === "string" ? jsonData.vintage : undefined;

    // Extract bottled date separately (bottling date, not vintage)
    const bottledDate =
      typeof jsonData.bottle_date === "string"
        ? jsonData.bottle_date
        : undefined;

    // Extract stated age
    const statedAge =
      typeof jsonData.age === "number"
        ? jsonData.age.toString()
        : typeof jsonData.stated_age === "string"
          ? jsonData.stated_age
          : undefined;

    // Extract cask type
    const caskType =
      typeof jsonData.cask_type === "string" ? jsonData.cask_type : undefined;

    // Extract strength
    const strengthText =
      typeof jsonData.strength === "string" ? jsonData.strength : undefined;
    const strength = strengthText
      ? parseFloat(strengthText.replace(",", ".").replace(" %vol", ""))
      : undefined;

    // Extract size
    const size =
      typeof jsonData.bottle_size === "number"
        ? jsonData.bottle_size.toString()
        : undefined;

    // Extract barcode
    const barcode =
      typeof jsonData.barcode === "string" ? jsonData.barcode : undefined;

    // Extract whisky group ID from mapping.bbid
    const whiskyGroupId =
      typeof jsonData.mapping === "object" &&
      jsonData.mapping !== null &&
      "bbid" in jsonData.mapping &&
      typeof jsonData.mapping.bbid === "number"
        ? jsonData.mapping.bbid
        : undefined;

    // Extract image URL from photos array or alternative_whisky_image
    let imageUrl: string | undefined;
    const photos = jsonData.photos;
    if (
      Array.isArray(photos) &&
      photos.length > 0 &&
      typeof photos[0] === "object" &&
      photos[0] !== null &&
      "normal" in photos[0] &&
      typeof (photos[0] as { normal: unknown }).normal === "string"
    ) {
      imageUrl = (photos[0] as { normal: string }).normal;
    } else {
      const bottle = jsonData.bottle;
      if (
        typeof bottle === "object" &&
        bottle !== null &&
        "alternative_whisky_image" in bottle
      ) {
        const altImage = (bottle as { alternative_whisky_image: unknown })
          .alternative_whisky_image;
        if (
          typeof altImage === "object" &&
          altImage !== null &&
          "normal" in altImage &&
          typeof (altImage as { normal: unknown }).normal === "string"
        ) {
          imageUrl = (altImage as { normal: string }).normal;
        }
      }
    }
    // Fallback to HTML extraction if not found in JSON
    imageUrl ??= $('img[alt*="bottle"], img[alt*="Bottle"]')
      .first()
      .attr("src");

    // Extract pricing data
    const pricing = this.extractPricingData($, html);
    // If jsonData exists (which we already checked above), empty pricing is OK (some whiskies have no pricing)
    // Only throw error if we can't extract JSON data at all, which is already handled above
    // So if we get here and pricing is empty, that's fine - the whisky just has no pricing data

    // Extract rating data
    const rating = this.extractRatingData($, html);

    const whisky: WhiskyData = {
      id: whiskyId,
      whiskyId: whiskyIdText,
      name,
      category,
      distillery,
      bottler,
      bottlingSeries,
      vintage,
      bottledDate, // Separate field for bottling date
      statedAge,
      caskType,
      strength,
      size,
      barcode,
      whiskyGroupId,
      imageUrl,
    };

    return {
      whisky,
      pricing,
      rating,
    };
  }

  /**
   * Extracts JSON data from Vue component attribute
   * This is a shared helper used by multiple extraction methods
   */
  private extractJsonData(html: string): Record<string, unknown> | null {
    const whiskyAttrStart = html.indexOf(':whisky="');
    const bottleAttrStart = html.indexOf(':bottle="');

    if (whiskyAttrStart === -1 && bottleAttrStart === -1) {
      return null;
    }

    try {
      const attrStart =
        whiskyAttrStart !== -1 ? whiskyAttrStart : bottleAttrStart;
      const valueStart = attrStart + 9; // length of ':whisky="' or ':bottle="' (9 chars)

      // Find the next attribute or > to limit our search
      const nextAttr = html.indexOf(' current="', valueStart);
      const nextGt = html.indexOf(">", valueStart);
      const searchEnd =
        nextAttr !== -1 && nextGt !== -1
          ? Math.min(nextAttr, nextGt)
          : nextAttr !== -1
            ? nextAttr
            : nextGt !== -1
              ? nextGt
              : html.length;

      // Look for }" pattern (closing brace + literal quote)
      // Search backwards from searchEnd
      let valueEnd = -1;
      for (let i = searchEnd - 1; i >= valueStart + 1; i--) {
        if (html[i] === '"') {
          // Check if this " is not part of &quot;
          const before = html.substring(Math.max(0, i - 6), i);
          if (before !== "&quot;" && !before.endsWith("&quot")) {
            // Found a literal quote - verify it's after a closing brace
            if (i > 0 && html[i - 1] === "}") {
              valueEnd = i;
              break;
            }
          }
        }
      }

      // Fallback: if no }" found, find last " before searchEnd that's not &quot;
      if (valueEnd === -1) {
        for (let i = searchEnd - 1; i >= valueStart; i--) {
          if (html[i] === '"') {
            const before = html.substring(Math.max(0, i - 6), i);
            if (before !== "&quot;" && !before.endsWith("&quot")) {
              valueEnd = i;
              break;
            }
          }
        }
      }

      if (valueEnd === -1) {
        return null;
      }

      // Get the JSON string (HTML-escaped)
      const jsonStrEscaped = html.substring(valueStart, valueEnd);

      if (!jsonStrEscaped) {
        return null;
      }

      // Unescape HTML entities in the JSON string
      const jsonStr = jsonStrEscaped
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      return JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Extracts a detail value from the details section
   * @deprecated Use extractJsonData instead - this is kept for backwards compatibility
   */
  private extractDetailValue(
    $: cheerio.CheerioAPI,
    label: string,
  ): string | undefined {
    // Look for the label in the page text
    const allText = $("body").text();
    const labelIndex = allText.indexOf(label);

    if (labelIndex === -1) {
      return undefined;
    }

    // Extract text after the label (up to next label or newline)
    const afterLabel = allText.substring(labelIndex + label.length);
    const splitResult = afterLabel.split(
      /\n|Category|Distillery|Bottler|Bottling|Bottled|Stated|Cask|Strength|Size|Barcode/,
    );
    const value = splitResult[0]?.trim();

    return value ?? undefined;
  }

  /**
   * Extracts pricing data from the page
   * The pricing data is embedded in a JSON object in Vue component attributes
   */
  private extractPricingData(
    $: cheerio.CheerioAPI,
    html: string,
  ): PricingData | undefined {
    const pricing: PricingData = {};

    // Try to extract JSON from Vue component attribute
    const data = this.extractJsonData(html);

    if (data) {
      try {
        // Extract from main object or nested bottle object

        const bottleData = data.bottle as Record<string, unknown> | undefined;
        const bottle = bottleData ?? data;

        // Extract asking price (retail price)

        const askingPrice = bottle.asking_price;
        if (askingPrice && typeof askingPrice === "string") {
          pricing.retailPrice = parseFloat(askingPrice);
          pricing.retailPriceCurrency = "EUR";

          // Parse asking price date

          const askingPriceDate = bottle.asking_price_date;
          if (askingPriceDate && typeof askingPriceDate === "string") {
            const dateStr = askingPriceDate;
            // Handle formats like "Dec 21, 2025" or "2025-12-21"
            if (dateStr.includes(",")) {
              const monthMap: Record<string, number> = {
                Jan: 0,
                Feb: 1,
                Mar: 2,
                Apr: 3,
                May: 4,
                Jun: 5,
                Jul: 6,
                Aug: 7,
                Sep: 8,
                Oct: 9,
                Nov: 10,
                Dec: 11,
              };
              const match =
                /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/.exec(
                  dateStr,
                );
              if (match?.[1] && match[2] && match[3]) {
                const month = monthMap[match[1]];
                const day = parseInt(match[2], 10);
                const year = parseInt(match[3], 10);
                if (month !== undefined && day && year) {
                  pricing.retailPriceDate = new Date(year, month, day);
                }
              }
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              // ISO format: "2025-12-21"
              pricing.retailPriceDate = new Date(dateStr);
            }
          }
        }

        // Extract market value (NOT evaluation price - they are different!)
        // Only extract if market_value_stats_id exists (indicates actual market value data)
        const marketValueStatsId = bottle.market_value_stats_id;
        const marketValueDate = bottle.market_value_date;

        if (
          marketValueStatsId !== null &&
          marketValueStatsId !== undefined &&
          marketValueDate !== null &&
          marketValueDate !== undefined
        ) {
          // Look for the price in localized_prices using market_value_stats_id
          const marketValueId =
            typeof marketValueStatsId === "number"
              ? String(marketValueStatsId)
              : typeof marketValueStatsId === "string"
                ? marketValueStatsId
                : null;

          // Check localized_prices in bottle object first, then data object
          const localizedPrices =
            (bottle.localized_prices as Record<string, string> | undefined) ??
            (data.localized_prices as Record<string, string> | undefined);

          if (marketValueId && localizedPrices?.[marketValueId]) {
            pricing.marketValue = parseFloat(localizedPrices[marketValueId]);
            pricing.marketValueCurrency = "EUR";

            // Parse market value date
            const dateStr =
              typeof marketValueDate === "string"
                ? marketValueDate
                : marketValueDate instanceof Date
                  ? marketValueDate.toISOString().split("T")[0]
                  : null;

            if (dateStr) {
              // Handle formats like "Dec 13, 2024" or "2024-12-13"
              if (dateStr.includes(",")) {
                const monthMap: Record<string, number> = {
                  Jan: 0,
                  Feb: 1,
                  Mar: 2,
                  Apr: 3,
                  May: 4,
                  Jun: 5,
                  Jul: 6,
                  Aug: 7,
                  Sep: 8,
                  Oct: 9,
                  Nov: 10,
                  Dec: 11,
                };
                const match =
                  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/.exec(
                    dateStr,
                  );
                if (match?.[1] && match[2] && match[3]) {
                  const month = monthMap[match[1]];
                  const day = parseInt(match[2], 10);
                  const year = parseInt(match[3], 10);
                  if (month !== undefined && day && year) {
                    pricing.marketValueDate = new Date(year, month, day);
                  }
                }
              } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                // ISO format: "2024-12-13"
                pricing.marketValueDate = new Date(dateStr);
              }
            }
          }
        }

        // Also try direct market_value field if it exists
        if (!pricing.marketValue) {
          const marketValue = bottle.market_value;
          if (marketValue && typeof marketValue === "string") {
            pricing.marketValue = parseFloat(marketValue);
            pricing.marketValueCurrency = "EUR";

            // Get market value date
            const mvDate = bottle.market_value_date;
            if (mvDate && typeof mvDate === "string") {
              const dateStr = mvDate;
              if (dateStr.includes(",")) {
                const monthMap: Record<string, number> = {
                  Jan: 0,
                  Feb: 1,
                  Mar: 2,
                  Apr: 3,
                  May: 4,
                  Jun: 5,
                  Jul: 6,
                  Aug: 7,
                  Sep: 8,
                  Oct: 9,
                  Nov: 10,
                  Dec: 11,
                };
                const match =
                  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/.exec(
                    dateStr,
                  );
                if (match?.[1] && match[2] && match[3]) {
                  const month = monthMap[match[1]];
                  const day = parseInt(match[2], 10);
                  const year = parseInt(match[3], 10);
                  if (month !== undefined && day && year) {
                    pricing.marketValueDate = new Date(year, month, day);
                  }
                }
              } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                pricing.marketValueDate = new Date(dateStr);
              }
            }
          }
        }

        // Fallback: try to extract from visible text if JSON parsing fails
      } catch {
        // JSON parsing failed, fall through to text extraction
      }
    }

    // Fallback: Try to extract from visible text (for backwards compatibility)
    if (!pricing.retailPrice) {
      const retailPriceMatch =
        /Retail Price[\s\S]{0,200}(€[\d,]+)[\s\S]{0,200}(Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)\s+(\d{1,2}),\s+(\d{4})/.exec(
          html,
        );
      if (
        retailPriceMatch?.[1] &&
        retailPriceMatch[2] &&
        retailPriceMatch[3] &&
        retailPriceMatch[4]
      ) {
        pricing.retailPrice = parseFloat(
          retailPriceMatch[1].replace("€", "").replace(",", "."),
        );
        pricing.retailPriceCurrency = "EUR";
        const monthMap: Record<string, number> = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          May: 4,
          Jun: 5,
          Jul: 6,
          Aug: 7,
          Sep: 8,
          Oct: 9,
          Nov: 10,
          Dec: 11,
        };
        const month = monthMap[retailPriceMatch[2]];
        const day = parseInt(retailPriceMatch[3], 10);
        const year = parseInt(retailPriceMatch[4], 10);
        if (month !== undefined && day && year) {
          pricing.retailPriceDate = new Date(year, month, day);
        }
      }
    }

    // Fallback: Extract market value from text
    if (!pricing.marketValue) {
      const marketValueMatch = /Market Value[\s\S]{0,200}(€[\d,]+)/.exec(html);
      if (
        marketValueMatch?.[1] &&
        !marketValueMatch[1].includes("no auction")
      ) {
        pricing.marketValue = parseFloat(
          marketValueMatch[1].replace("€", "").replace(",", "."),
        );
        pricing.marketValueCurrency = "EUR";
        pricing.marketValueDate = new Date();
      }
    }

    return Object.keys(pricing).length > 0 ? pricing : undefined;
  }

  /**
   * Extracts rating data from the page
   * The rating data is embedded in a JSON object in Vue component attributes
   */
  private extractRatingData(
    $: cheerio.CheerioAPI,
    html: string,
  ): RatingData | undefined {
    const rating: RatingData = {};

    // Try to extract JSON from Vue component attribute
    const data = this.extractJsonData(html);

    if (data) {
      try {
        // Extract rating from main object
        // The rating is in the main whisky object, not in the bottle object
        const ratingValue = data.rating;
        if (ratingValue !== null && ratingValue !== undefined) {
          if (typeof ratingValue === "number") {
            rating.averageRating = ratingValue;
          } else if (typeof ratingValue === "string") {
            rating.averageRating = parseFloat(ratingValue);
          }
        }

        // Extract votes (number of ratings)
        const votesValue = data.votes;
        if (votesValue !== null && votesValue !== undefined) {
          if (typeof votesValue === "number") {
            rating.numberOfRatings = votesValue;
          } else if (typeof votesValue === "string") {
            rating.numberOfRatings = parseInt(votesValue, 10);
          }
        }

        // Fallback: try to extract from visible text if JSON parsing fails
      } catch {
        // JSON parsing failed, fall through to text extraction
      }
    }

    // Fallback: Try to extract from visible text (for backwards compatibility)
    if (!rating.averageRating) {
      const ratingMatch = /(\d+)\/100/.exec(html);
      if (ratingMatch?.[1]) {
        rating.averageRating = parseFloat(ratingMatch[1]);
        // Try to find number of ratings
        const ratingsCountMatch = /Ratings\s+(\d+)/.exec(html);
        if (ratingsCountMatch?.[1]) {
          rating.numberOfRatings = parseInt(ratingsCountMatch[1], 10);
        }
      }
    }

    return Object.keys(rating).length > 0 ? rating : undefined;
  }

  /**
   * Saves raw HTML to disk
   */
  async saveRawData(whiskyId: number, html: string): Promise<void> {
    try {
      await fs.mkdir(this.config.rawDataDir, { recursive: true });
      const filePath = join(this.config.rawDataDir, `${whiskyId}.html`);
      await fs.writeFile(filePath, html, "utf-8");
    } catch (error) {
      // Log but don't throw - raw data storage is non-blocking
      console.error(`Failed to save raw data for whisky ${whiskyId}:`, error);
    }
  }

  /**
   * Scrapes a single whisky page
   */
  async scrapeWhisky(whiskyId: number): Promise<ScrapedWhiskyData | null> {
    try {
      const html = await this.fetchWhiskyPage(whiskyId);
      // Note: saveRawData is now called in fetchWhiskyPage when fetching
      return this.parseWhiskyPage(html, whiskyId);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw error; // Re-throw 404 to signal end of entries
      }
      throw new Error(
        `Failed to scrape whisky ${whiskyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
