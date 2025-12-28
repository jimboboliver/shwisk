export interface WhiskyData {
  id: number;
  whiskyId: string; // e.g., "WB1"
  name: string;
  category?: string;
  distillery?: string;
  bottler?: string;
  bottlingSeries?: string;
  vintage?: string;
  bottledDate?: string;
  statedAge?: string;
  caskType?: string;
  strength?: number;
  size?: string;
  barcode?: string;
  whiskyGroupId?: number;
  uncolored?: boolean;
  nonChillfiltered?: boolean;
  caskStrength?: boolean;
  numberOfBottles?: number;
  imageUrl?: string;
}

export interface PricingData {
  marketValue?: number;
  marketValueCurrency?: string;
  marketValueDate?: Date;
  retailPrice?: number;
  retailPriceCurrency?: string;
  retailPriceDate?: Date;
}

export interface RatingData {
  averageRating?: number;
  numberOfRatings?: number;
}

export interface ScrapedWhiskyData {
  whisky: WhiskyData;
  pricing?: PricingData;
  rating?: RatingData;
}
