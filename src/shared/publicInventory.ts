export type PublicInventoryAvailability =
  | "SOLD_OUT"
  | "LOW_STOCK"
  | "IN_STOCK";

export const PUBLIC_LOW_STOCK_MAXIMUM = 3;

export function publicAvailabilityForUnits(
  unitsAvailable: number,
): PublicInventoryAvailability {
  if (unitsAvailable <= 0) {
    return "SOLD_OUT";
  }

  if (unitsAvailable <= PUBLIC_LOW_STOCK_MAXIMUM) {
    return "LOW_STOCK";
  }

  return "IN_STOCK";
}

export type PublicInventoryItem = {
  id: number;
  name: string;
  shortDescription: string | null;
  imageUrl: string | null;
  displayPrice: number | null;
  featured: boolean;
  availability: PublicInventoryAvailability;
};

export type AdminPublicListingItem = {
  id: number;
  internalName: string;
  displayName: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  stockStatus: PublicInventoryAvailability;
  expectedSalePrice: number | null;
  publicPrice: number | null;
  publicVisible: boolean;
  featured: boolean;
};

export type AdminPublicListingUpdate = {
  id: number;
  displayName?: string | null;
  shortDescription?: string | null;
  publicPrice?: number | null;
  publicVisible?: boolean;
  featured?: boolean;
};
