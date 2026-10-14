import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
  PublicInventoryAvailability,
  PublicInventoryItem,
} from "../../shared/publicInventory";
import { primaryMerchandisingBadge } from "../../shared/publicInventory";

export type ProductGalleryImage = {
  alt: string;
  url: string;
};

export type ProductDetailOpenHandler = (
  trigger: HTMLElement,
  product: PublicInventoryItem,
) => void;

const availabilityLabels: Record<PublicInventoryAvailability, string> = {
  IN_STOCK: "In Stock",
  COMING_SOON: "Coming Soon!",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
};

const detailBadgeLabels = {
  RECENT_PRICE_DROP: "Recent Price Drop",
  COMING_SOON: "Coming Soon",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
  FEATURED: "Featured",
} as const;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatPublicProductPrice(price: number | null) {
  return price === null ? "Contact for price" : currencyFormatter.format(price);
}

export function galleryImagesForProduct(
  product: PublicInventoryItem,
): ProductGalleryImage[] {
  return product.imageUrl
    ? [{ url: product.imageUrl, alt: product.name }]
    : [];
}

export function nextGalleryIndex(
  currentIndex: number,
  imageCount: number,
  direction: 1 | -1,
) {
  if (imageCount <= 1) return 0;
  return (currentIndex + direction + imageCount) % imageCount;
}

export function restoreProductDetailFocus(target: HTMLElement | null) {
  globalThis.setTimeout(() => target?.focus(), 0);
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d={direction === "left" ? "m12.5 4-6 6 6 6" : "m7.5 4 6 6-6 6"} />
    </svg>
  );
}

function ProductGallery({
  images,
  productName,
}: {
  images: ProductGalleryImage[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    setActiveIndex(current => Math.min(current, Math.max(images.length - 1, 0)));
  }, [images.length]);

  function move(direction: 1 | -1) {
    setActiveIndex(current => nextGalleryIndex(current, images.length, direction));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null || !hasMultipleImages) return;
    const distance = (event.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(distance) < 44) return;
    move(distance < 0 ? 1 : -1);
  }

  return (
    <section className="public-product-gallery" aria-label={`${productName} image gallery`}>
      <div
        className="public-product-gallery__stage"
        tabIndex={hasMultipleImages ? 0 : -1}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {images.length > 0 ? (
          <img
            src={images[activeIndex].url}
            alt={images[activeIndex].alt}
            decoding="async"
          />
        ) : (
          <div className="public-product-gallery__fallback" role="img" aria-label={`${productName} image not available`}>
            <span>DR</span>
            <small>Image coming soon</small>
          </div>
        )}

        {hasMultipleImages && (
          <>
            <button
              className="public-product-gallery__arrow public-product-gallery__arrow--previous"
              type="button"
              aria-label="Previous product image"
              onClick={() => move(-1)}
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              className="public-product-gallery__arrow public-product-gallery__arrow--next"
              type="button"
              aria-label="Next product image"
              onClick={() => move(1)}
            >
              <ChevronIcon direction="right" />
            </button>
            <span className="public-product-gallery__count" aria-live="polite">
              {activeIndex + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {hasMultipleImages && (
        <div className="public-product-gallery__thumbnails" aria-label="Choose a product image">
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              className={index === activeIndex ? "is-active" : undefined}
              type="button"
              aria-label={`Show image ${index + 1} of ${images.length}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              <img src={image.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductDetailContent({
  images,
  onInterested,
  product,
}: {
  images?: ProductGalleryImage[];
  onInterested: (trigger: HTMLButtonElement) => void;
  product: PublicInventoryItem;
}) {
  const galleryImages = useMemo(
    () => images ?? galleryImagesForProduct(product),
    [images, product],
  );
  const primaryBadge = primaryMerchandisingBadge(product);

  return (
    <div className="public-product-detail__body">
      <ProductGallery images={galleryImages} productName={product.name} />

      <section className="public-product-detail__information">
        <div className="public-product-detail__meta">
          <span className="public-product-detail__status">
            {primaryBadge && (
              <span className={`public-stock-badge public-stock-badge--${primaryBadge.toLowerCase()}`}>
                {detailBadgeLabels[primaryBadge]}
              </span>
            )}
            {primaryBadge !== product.availability && (
              <span className="public-availability-text">{availabilityLabels[product.availability]}</span>
            )}
          </span>
          <span className="public-product-detail__prices">
            <strong>{formatPublicProductPrice(product.displayPrice)}</strong>
            {product.recentPriceDrop && product.compareAtPrice !== null && (
              <del>was {formatPublicProductPrice(product.compareAtPrice)}</del>
            )}
          </span>
        </div>
        <h2 id="public-product-detail-title">{product.name}</h2>
        {product.availability === "COMING_SOON" && <p className="public-arrival-note">Arriving soon</p>}
        {product.availability !== "COMING_SOON" && product.moreArrivingSoon && <p className="public-arrival-note">More inventory is arriving soon.</p>}
        {product.shortDescription ? (
          <p>{product.shortDescription}</p>
        ) : (
          <p className="public-product-detail__description-fallback">
            Contact us for more information about this product.
          </p>
        )}
        <button
          className="public-button public-button--primary public-product-detail__interest"
          type="button"
          onClick={(event) => onInterested(event.currentTarget)}
        >
          {product.availability === "COMING_SOON" ? "Ask about arrival" : "I’m interested"}
        </button>
      </section>
    </div>
  );
}

export function ProductDetailModal({
  images,
  onClose,
  onInterested,
  product,
}: {
  images?: ProductGalleryImage[];
  onClose: () => void;
  onInterested: (trigger: HTMLButtonElement, product: PublicInventoryItem) => void;
  product: PublicInventoryItem;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const publicSite = document.querySelector<HTMLElement>(".public-site");
    const hadInertAttribute = publicSite?.hasAttribute("inert") ?? false;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    publicSite?.setAttribute("inert", "");
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (!hadInertAttribute) publicSite?.removeAttribute("inert");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div className="public-product-detail-backdrop" role="presentation" onMouseDown={closeFromBackdrop}>
      <div
        ref={dialogRef}
        className="public-product-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-product-detail-title"
        tabIndex={-1}
      >
        <header className="public-product-detail__header">
          <div>
            <p className="public-kicker">Product details</p>
            <span>View product information and get in touch.</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close product details"
            onClick={onClose}
          >
            &times;
          </button>
        </header>

        <ProductDetailContent
          images={images}
          product={product}
          onInterested={(trigger) => onInterested(trigger, product)}
        />
      </div>
    </div>,
    document.body,
  );
}
