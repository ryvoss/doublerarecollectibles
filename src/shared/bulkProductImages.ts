export type ImageMatchProduct = {
  id: number;
  internalName: string;
  displayName: string | null;
};

export type ImageMatchStatus = "EXACT" | "SUGGESTED" | "NEEDS_REVIEW" | "UNMATCHED";

export type ProductImageMatch = {
  productId: number | null;
  status: ImageMatchStatus;
  confidence: number;
  candidateProductIds: number[];
};

export function normalizeImageMatchText(value: string) {
  const withoutExtension = value.replace(/\.(?:jpe?g|png|webp)$/i, "");
  return withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarity(left: string, right: string) {
  if (left === right) return 1;
  const length = Math.max(left.length, right.length);
  if (length === 0) return 1;
  const editScore = 1 - levenshtein(left, right) / length;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const tokenScore = shared / Math.max(1, new Set([...leftTokens, ...rightTokens]).size);
  return editScore * 0.7 + tokenScore * 0.3;
}

export function suggestProductForImage(fileName: string, products: ImageMatchProduct[]): ProductImageMatch {
  const normalizedFile = normalizeImageMatchText(fileName);
  if (!normalizedFile) return { productId: null, status: "UNMATCHED", confidence: 0, candidateProductIds: [] };

  const exact = products.filter((product) => [product.internalName, product.displayName]
    .filter((name): name is string => Boolean(name))
    .some((name) => normalizeImageMatchText(name) === normalizedFile));
  if (exact.length === 1) return { productId: exact[0].id, status: "EXACT", confidence: 1, candidateProductIds: [exact[0].id] };
  if (exact.length > 1) return { productId: null, status: "NEEDS_REVIEW", confidence: 1, candidateProductIds: exact.map((product) => product.id) };

  const scored = products.map((product) => ({
    product,
    score: Math.max(...[product.internalName, product.displayName]
      .filter((name): name is string => Boolean(name))
      .map((name) => similarity(normalizedFile, normalizeImageMatchText(name)))),
  })).sort((left, right) => right.score - left.score || left.product.id - right.product.id);
  const first = scored[0];
  if (!first || first.score < 0.7) return { productId: null, status: "UNMATCHED", confidence: first?.score ?? 0, candidateProductIds: [] };
  const closeCandidates = scored.filter((candidate) => first.score - candidate.score < 0.1 && candidate.score >= 0.7);
  if (first.score < 0.77 || closeCandidates.length > 1) {
    return { productId: null, status: "NEEDS_REVIEW", confidence: first.score, candidateProductIds: closeCandidates.map((candidate) => candidate.product.id) };
  }
  return { productId: first.product.id, status: "SUGGESTED", confidence: first.score, candidateProductIds: [first.product.id] };
}

export function duplicateProductAssignments(productIds: Array<number | null>) {
  const counts = new Map<number, number>();
  productIds.forEach((id) => { if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1); });
  return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
}

export async function runIndependentImageUploads<T>(
  items: T[],
  upload: (item: T) => Promise<void>,
) {
  const results: Array<{ item: T; ok: boolean; error: string | null }> = [];
  for (const item of items) {
    try {
      await upload(item);
      results.push({ item, ok: true, error: null });
    } catch (error) {
      results.push({ item, ok: false, error: error instanceof Error ? error.message : "Upload failed" });
    }
  }
  return results;
}
