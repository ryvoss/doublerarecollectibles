import type { ProductImageStorage, StoredProductImage } from "./productImageStorage";

export class ProductImageConflictError extends Error {}

export async function replaceProductImage({
  currentImageKey,
  image,
  onCleanupError,
  productId,
  storage,
  updateImageKey,
}: {
  currentImageKey: string | null;
  image: StoredProductImage;
  onCleanupError?: (error: unknown) => void;
  productId: number;
  storage: ProductImageStorage;
  updateImageKey: (newImageKey: string) => Promise<boolean>;
}) {
  const newImageKey = await storage.saveProductImage(productId, image);
  let committed = false;
  try {
    committed = await updateImageKey(newImageKey);
    if (!committed) throw new ProductImageConflictError("The product image changed during upload. Try again.");
  } catch (error) {
    await storage.deleteProductImage(newImageKey).catch(() => undefined);
    throw error;
  }

  try {
    await storage.deleteProductImage(currentImageKey);
  } catch (error) {
    onCleanupError?.(error);
  }
  return newImageKey;
}
