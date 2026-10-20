import { lazy, Suspense } from "react";
import { EMPTY_EDITORIAL, type PublicEditorial } from "../../shared/storefrontContent";
import { PublicCatalogProvider, usePublicCatalog } from "./PublicCatalog";
import { AnnouncementRail, ShowCard, SectionHeading } from "./StorefrontSections";
const NewsPage = lazy(() => import("./NewsPage"));
import { PublicLink } from "./PublicLink";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ContactExperience,
  ContactOptionsModal,
  HeaderContactAction,
  contactProductContext,
  type ContactOpenHandler,
  type ContactProductContext,
} from "./ContactOptions";
import FeaturedInventorySection from "./FeaturedInventorySection";
import ComingSoonSection from "./ComingSoonSection";
import PublicInventoryPage from "./PublicInventoryPage";
import {
  ProductDetailModal,
  restoreProductDetailFocus,
  type ProductDetailOpenHandler,
} from "./ProductDetailModal";
import type { PublicInventoryItem } from "../../shared/publicInventory";
import {
  EMPTY_PUBLIC_SITE_ASSETS,
  PUBLIC_SITE_DEFAULTS,
  CTA_TARGET_PATHS,
  isAnnouncementActive,
  visibleHomepageSectionKeys,
  type PublicSiteConfiguration,
  type PublicNextShow,
  type PublicSiteSettings,
} from "../../shared/publicSite";
import "./ContactOptions.css";
import "./ProductDetailModal.css";
import "./PublicTheme.css";
import "./PublicSite.css";
import "./StorefrontRetail.css";

type PublicSiteProps = {
  pathname: string;
  search?: string;
  onNavigate: (path: string) => void;
};

const publicNavigation = [
  { href: "/inventory", label: "Inventory" },
  { href: "/shows", label: "Shows" },
  { href: "/news", label: "News / Updates" },
  { href: "/buy-sell-trade", label: "Buy / Sell / Trade" },
  { href: "/contact", label: "Contact" },
];

const knownPublicPaths = new Set([
  "/",
  "/inventory",
  "/shows",
  "/news",
  "/buy-sell-trade",
  "/contact",
]);

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle className="public-instagram-dot" cx="17.4" cy="6.7" r="1" />
    </svg>
  );
}

function PublicBrandMark({
  businessName,
  compact = false,
  logoUrl,
}: {
  businessName: string;
  compact?: boolean;
  logoUrl: string | null;
}) {
  if (compact) {
    return (
      <span className={`public-brand__mark public-brand__mark--compact${logoUrl ? " has-image" : ""}`}>
        {logoUrl ? <img src={logoUrl} alt={`${businessName} logo`} /> : "DR"}
      </span>
    );
  }

  return (
    <span className={`public-brand__mark${logoUrl ? " has-image" : ""}`}>
      {logoUrl ? <img src={logoUrl} alt={`${businessName} logo`} /> : "DR"}
    </span>
  );
}

function PublicSite(props: PublicSiteProps) {
  return <PublicCatalogProvider pathname={props.pathname}><PublicSiteContent {...props} /></PublicCatalogProvider>;
}

function PublicSiteContent({ pathname, search = "", onNavigate }: PublicSiteProps) {
  const catalog = usePublicCatalog();
  const [editorial, setEditorial] = useState<PublicEditorial>(EMPTY_EDITORIAL);
  const [editorialError, setEditorialError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactProduct, setContactProduct] = useState<ContactProductContext>();
  const [detailProduct, setDetailProduct] = useState<PublicInventoryItem>();
  const contactTriggerRef = useRef<HTMLElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const detailProductIdRef = useRef<number | undefined>(undefined);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const [siteConfiguration, setSiteConfiguration] = useState<PublicSiteConfiguration>({
    settings: { ...PUBLIC_SITE_DEFAULTS },
    assets: { ...EMPTY_PUBLIC_SITE_ASSETS },
    nextShow: null,
  });
  const { assets, settings } = siteConfiguration;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/public/editorial", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Updates unavailable");
        const content = await response.json() as PublicEditorial;
        if (!controller.signal.aborted) setEditorial(content);
      }).catch(() => { if (!controller.signal.aborted) setEditorialError(true); });
    return () => controller.abort();
  }, []);


  useEffect(() => {
    const controller = new AbortController();

    async function loadSiteConfiguration() {
      try {
        const response = await fetch("/api/public/site", {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const body = (await response.json()) as PublicSiteConfiguration;
        if (!controller.signal.aborted && body?.settings && body?.assets) {
          setSiteConfiguration(body);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Public site configuration loading failed:", error);
        }
      }
    }

    void loadSiteConfiguration();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const pageLabel = pathname === "/inventory"
      ? settings.inventoryPageTitle
      : pathname === "/shows"
        ? settings.showsPageTitle
        : pathname === "/contact"
          ? settings.contactPageTitle
          : pathname === "/news" || pathname.startsWith("/news/")
            ? "News & Updates"
          : pathname === "/buy-sell-trade"
            ? "Buy / Sell / Trade"
            : "";

    if (!pathname.startsWith("/news/")) {
      document.title = pageLabel ? `${pageLabel} | ${settings.businessName}` : settings.businessName;
    }
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", settings.heroSubtitle);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname, settings]);

  useEffect(() => {
    const selector = 'link[data-public-site-favicon="true"]';
    document.querySelector(selector)?.remove();
    if (!assets.faviconUrl) return;

    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.href = assets.faviconUrl;
    favicon.dataset.publicSiteFavicon = "true";
    document.head.appendChild(favicon);
    return () => favicon.remove();
  }, [assets.faviconUrl]);

  useEffect(() => {
    function handleScroll() {
      setCompactHeader(window.scrollY > 28);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    mobileNavigationRef.current
      ?.querySelector<HTMLAnchorElement>("a")
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const openContact: ContactOpenHandler = useCallback((trigger, product) => {
    contactTriggerRef.current = trigger;
    setContactProduct(product);
    setMenuOpen(false);
    setContactOpen(true);
  }, []);

  const closeContact = useCallback(() => {
    setContactOpen(false);
    setContactProduct(undefined);
    restoreProductDetailFocus(contactTriggerRef.current);
  }, []);

  const openProductDetail: ProductDetailOpenHandler = useCallback((trigger, product) => {
    detailTriggerRef.current = trigger;
    detailProductIdRef.current = product.id;
    setDetailProduct(product);
  }, []);

  const closeProductDetail = useCallback(() => {
    setDetailProduct(undefined);
    restoreProductDetailFocus(detailTriggerRef.current, detailProductIdRef.current);
  }, []);

  const contactFromProductDetail = useCallback((
    trigger: HTMLButtonElement,
    product: PublicInventoryItem,
  ) => {
    const returnFocusTarget = detailTriggerRef.current ?? trigger;
    setDetailProduct(undefined);
    openContact(returnFocusTarget, contactProductContext(product));
  }, [openContact]);

  useEffect(() => {
    if (!detailProduct || catalog.loading) return;
    const current = catalog.products.find((product) => product.id === detailProduct.id);
    if (catalog.error || !current) closeProductDetail();
    else if (current !== detailProduct) setDetailProduct(current);
  }, [catalog.products, catalog.error, catalog.loading, detailProduct, closeProductDetail]);

  return (
    <div className="public-site">
      <a className="public-skip-link" href="#public-main">Skip to content</a>
      <header className={`public-header${compactHeader ? " public-header--compact" : ""}`}>
        <div className="public-header__inner">
          <PublicLink className="public-brand" href="/" onNavigate={onNavigate}>
            <PublicBrandMark
              businessName={settings.businessName}
              compact
              logoUrl={assets.primaryLogoUrl}
            />
            <span className="public-brand__copy">
              <strong>{settings.businessName}</strong>
              <span>{settings.tagline}</span>
            </span>
          </PublicLink>

          <nav className="public-navigation public-navigation--desktop" aria-label="Main navigation">
            {publicNavigation.map((item) => (
              <PublicLink
                key={item.href}
                current={pathname === item.href || (item.href === "/news" && pathname.startsWith("/news/"))}
                className={pathname === item.href ? "is-active" : undefined}
                href={item.href}
                onNavigate={onNavigate}
              >
                {item.label}
              </PublicLink>
            ))}
          </nav>

          <div className="public-header__actions">
            <HeaderContactAction onOpen={openContact} />

            <button
              ref={menuButtonRef}
              className="public-menu-button"
              type="button"
              aria-controls="public-mobile-navigation"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            ref={mobileNavigationRef}
            id="public-mobile-navigation"
            className="public-navigation public-navigation--mobile"
            aria-label="Mobile navigation"
          >
            {publicNavigation.map((item) => (
              <PublicLink
                key={item.href}
                current={pathname === item.href || (item.href === "/news" && pathname.startsWith("/news/"))}
                className={pathname === item.href ? "is-active" : undefined}
                href={item.href}
                onNavigate={onNavigate}
              >
                <span>{item.label}</span>
                <ArrowIcon />
              </PublicLink>
            ))}
          </nav>
        )}
      </header>

      {pathname !== "/" && isAnnouncementActive(settings) && <div className="public-announcement" role="status"><div className="public-container"><span>{settings.announcementMessage}</span>{settings.announcementCtaLabel && <PublicLink href={CTA_TARGET_PATHS[settings.announcementCtaTarget]} onNavigate={onNavigate}>{settings.announcementCtaLabel} <ArrowIcon /></PublicLink>}</div></div>}

      <main id="public-main" tabIndex={-1}>
        {pathname === "/" && (
          <HomePage
            editorial={editorial}
            editorialError={editorialError}
            heroImageUrl={assets.heroImageUrl}
            onContact={openContact}
            onNavigate={onNavigate}
            onProductOpen={openProductDetail}
            nextShow={siteConfiguration.nextShow}
            settings={settings}
          />
        )}
        {pathname === "/inventory" && (
          <PublicInventoryPage
            searchQuery={search}
            categories={editorial.categories}
            categoriesError={editorialError}
            onNavigate={onNavigate}
            onContact={openContact}
            onProductOpen={openProductDetail}
            settings={settings}
          />
        )}
        {pathname === "/shows" && (
          <ShowsPage shows={siteConfiguration.upcomingShows ?? (siteConfiguration.nextShow ? [siteConfiguration.nextShow] : [])} onNavigate={onNavigate} settings={settings} />
        )}
        {pathname === "/buy-sell-trade" && (
          <BuySellTradePage onContact={openContact} onNavigate={onNavigate} settings={settings} />
        )}
        {pathname === "/contact" && <ContactPage settings={settings} />}
        {(pathname === "/news" || /^\/news\/[^/]+$/.test(pathname)) && <Suspense fallback={<p className="public-container" role="status">Loading updates...</p>}><NewsPage key={pathname} businessName={settings.businessName} slug={pathname === "/news" ? undefined : pathname.slice(6)} onNavigate={onNavigate} /></Suspense>}
        {!knownPublicPaths.has(pathname) && !/^\/news\/[^/]+$/.test(pathname) && <NotFoundPage onNavigate={onNavigate} />}
      </main>

      <PublicFooter
        logoUrl={assets.primaryLogoUrl}
        onNavigate={onNavigate}
        settings={settings}
      />
      {contactOpen && (
        <ContactOptionsModal
          onClose={closeContact}
          product={contactProduct}
          settings={settings}
        />
      )}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={closeProductDetail}
          onInterested={contactFromProductDetail}
        />
      )}
    </div>
  );
}

function HomePage({
  editorial,
  editorialError,
  heroImageUrl,
  nextShow,
  onContact,
  onNavigate,
  onProductOpen,
  settings,
}: Pick<PublicSiteProps, "onNavigate"> & {
  editorial: PublicEditorial;
  editorialError: boolean;
  heroImageUrl: string | null;
  nextShow: PublicNextShow | null;
  onContact: ContactOpenHandler;
  onProductOpen: ProductDetailOpenHandler;
  settings: PublicSiteSettings;
}) {
  const sections: Record<PublicSiteSettings["homepageSections"][number]["key"], ReactNode> = {
    UPDATES: <AnnouncementRail key="updates" items={[
      ...(isAnnouncementActive(settings) ? [{ type: "STORE_UPDATE" as const, title: settings.announcementMessage, summary: "", imageUrl: null, href: CTA_TARGET_PATHS[settings.announcementCtaTarget], actionLabel: settings.announcementCtaLabel, date: null }] : []),
      ...editorial.announcements,
    ]} onNavigate={onNavigate} />,
    HERO: <section className="public-hero" key="hero"><div className="public-container public-hero__layout"><div className="public-hero__content"><p className="public-kicker">{settings.tagline}</p><h2>{settings.heroTitle}</h2><p className="public-hero__lead">{settings.heroSubtitle}</p><div className="public-hero__actions"><PublicLink className="public-button public-button--primary public-hero__cta" href={CTA_TARGET_PATHS[settings.primaryCtaTarget]} onNavigate={onNavigate}>{settings.primaryCtaLabel}<ArrowIcon /></PublicLink>{settings.secondaryCtaEnabled && <PublicLink className="public-button public-button--secondary public-hero__cta" href={CTA_TARGET_PATHS[settings.secondaryCtaTarget]} onNavigate={onNavigate}>{settings.secondaryCtaLabel}</PublicLink>}</div><p className="public-hero__note">Explore at your pace. Contact us to confirm availability before making plans.</p></div><div className="public-hero__visual" aria-hidden="true">{heroImageUrl ? <img src={heroImageUrl} alt="" /> : <span>DR</span>}</div></div><div className="public-container public-hero__promise" aria-label={`${settings.businessName} service highlights`}><span>Sealed inventory</span><span>Local card shows</span><span>Buy, sell, and trade</span></div></section>,
    MERCHANDISING: <FeaturedInventorySection categories={editorial.categories} key="merchandising" excludeComingSoon={settings.homepageSections.some((section) => section.key === "COMING_SOON" && section.visible)} onContact={onContact} onNavigate={onNavigate} onProductOpen={onProductOpen} settings={settings} />,
    COMING_SOON: <ComingSoonSection key="coming-soon" onContact={onContact} onProductOpen={onProductOpen} settings={settings} />,
    NEXT_SHOW: nextShow ? <NextShowSection key="next-show" nextShow={nextShow} onNavigate={onNavigate} settings={settings} /> : null,
    BUY_SELL_TRADE: <section className="public-section public-section--muted" key="bst"><div className="public-container"><SectionHeading eyebrow="Collector to collector" title={settings.buySellTradeTitle}><PublicLink className="public-text-link" href="/buy-sell-trade" onNavigate={onNavigate}>{settings.buySellTradeCtaLabel} &rarr;</PublicLink></SectionHeading><p className="public-inner-page__lead">{settings.buySellTradeText}</p><BuySellTradeOptions onNavigate={onNavigate} onContact={onContact} /></div></section>,
    CONTACT: <section className="public-contact-band" key="contact"><div className="public-container"><div><p className="public-kicker">Questions welcome</p><h2>{settings.contactPageTitle}</h2><p className="public-contact-band__copy">{settings.contactText}</p></div><div className="public-contact-band__actions"><button className="public-button public-button--primary" type="button" onClick={(event) => onContact(event.currentTarget)}>Contact us<ArrowIcon /></button><PublicLink className="public-button public-button--secondary" href="/contact" onNavigate={onNavigate}>Contact options</PublicLink></div></div></section>,
  };
  return <>{<h1 className="public-visually-hidden">{settings.businessName}</h1>}{editorialError && <p className="public-container public-service-notice" role="status">Updates and categories are temporarily unavailable. <PublicLink href="/inventory" onNavigate={onNavigate}>Browse all inventory</PublicLink></p>}{visibleHomepageSectionKeys(settings.homepageSections).map((key) => sections[key])}</>;
}

function NextShowSection({ nextShow, onNavigate, settings }: { nextShow: PublicNextShow; onNavigate: (path: string) => void; settings: PublicSiteSettings }) {
  return <section className="public-section public-next-show"><div className="public-container"><SectionHeading eyebrow="Meet us at the table" title={settings.nextShowSectionTitle} /><ShowCard show={nextShow} nearest onNavigate={onNavigate} /></div></section>;
}

function ShowsPage({
  shows,
  onNavigate,
  settings,
}: Pick<PublicSiteProps, "onNavigate"> & { shows: PublicNextShow[]; settings: PublicSiteSettings }) {
  return (
    <section className="public-inner-page public-shows-page">
      <div className="public-container">
        <p className="public-kicker">Meet us in person</p>
        <h1>{settings.showsPageTitle}</h1>
        <p className="public-inner-page__lead">{settings.showsIntroText}</p>

        {shows.length ? <div className="public-show-list">{shows.map((show, index) => <ShowCard key={`${show.date}-${show.name}`} show={show} nearest={index === 0} detail onNavigate={onNavigate} />)}</div> : <div className="public-empty-state">
          <span aria-hidden="true">DR</span>
          <div>
            <h2>No public show dates are posted right now.</h2>
            <p>
              Follow us on Instagram for current event updates, or contact us
              before making plans to visit.
            </p>
          </div>
          <div className="public-empty-state__actions">
            <a
              className="public-button public-button--primary"
              href={settings.instagramUrl}
              target="_blank"
              rel="noreferrer"
            >
              <InstagramIcon />
              Check Instagram
            </a>
            <PublicLink
              className="public-button public-button--secondary"
              href="/contact"
              onNavigate={onNavigate}
            >
              Contact us
            </PublicLink>
          </div>
        </div>}
      </div>
    </section>
  );
}

function BuySellTradePage({
  onContact,
  onNavigate,
  settings,
}: Pick<PublicSiteProps, "onNavigate"> & { settings: PublicSiteSettings; onContact: ContactOpenHandler }) {
  return (
    <section className="public-inner-page">
      <div className="public-container">
        <p className="public-kicker">Collector to collector</p>
        <h1>{settings.buySellTradeTitle}</h1>
        <p className="public-inner-page__lead">{settings.buySellTradeText}</p>

        <BuySellTradeOptions onNavigate={onNavigate} onContact={onContact} />

        <div className="public-page-actions">
          <PublicLink
            className="public-button public-button--primary"
            href="/contact"
            onNavigate={onNavigate}
          >
            Start a conversation
            <ArrowIcon />
          </PublicLink>
          <PublicLink
            className="public-button public-button--secondary"
            href="/inventory"
            onNavigate={onNavigate}
          >
            Browse inventory
          </PublicLink>
        </div>
      </div>
    </section>
  );
}

function BuySellTradeOptions({ onNavigate, onContact }: { onNavigate: (path: string) => void; onContact: ContactOpenHandler }) {
  return <div className="public-bst-options">
    <div className="public-bst-option"><h3>Buy</h3><p>Find something for your collection, or a gift worth asking about.</p><PublicLink className="public-text-link" href="/inventory" onNavigate={onNavigate}>Browse inventory &rarr;</PublicLink></div>
    <div className="public-bst-option"><h3>Sell</h3><p>Tell us what you are looking to move. Start with a short description.</p><button className="public-text-link" type="button" onClick={(event) => onContact(event.currentTarget)}>Tell us what you have &rarr;</button></div>
    <div className="public-bst-option"><h3>Trade</h3><p>Have something in mind? Let us talk through the possibilities together.</p><button className="public-text-link" type="button" onClick={(event) => onContact(event.currentTarget)}>Start a conversation &rarr;</button></div>
  </div>;
}

function ContactPage({ settings }: { settings: PublicSiteSettings }) {
  return (
    <section className="public-inner-page public-contact-page">
      <div className="public-container">
        <p className="public-kicker">Let&apos;s talk collectibles</p>
        <h1>{settings.contactPageTitle}</h1>
        <p className="public-inner-page__lead">{settings.contactText}</p>

        <ContactExperience settings={settings} />
      </div>
    </section>
  );
}

function NotFoundPage({ onNavigate }: Pick<PublicSiteProps, "onNavigate">) {
  return (
    <section className="public-inner-page public-not-found">
      <div className="public-container">
        <p className="public-kicker">404</p>
        <h1>That page isn’t in the collection.</h1>
        <PublicLink
          className="public-button public-button--primary"
          href="/"
          onNavigate={onNavigate}
        >
          Return home
        </PublicLink>
      </div>
    </section>
  );
}

function PublicFooter({
  logoUrl,
  onNavigate,
  settings,
}: Pick<PublicSiteProps, "onNavigate"> & {
  logoUrl: string | null;
  settings: PublicSiteSettings;
}) {
  return (
    <footer className="public-footer">
      <div className="public-container public-footer__inner">
        <div className="public-footer__brand">
          <PublicBrandMark businessName={settings.businessName} logoUrl={logoUrl} />
          <div>
            <strong>{settings.businessName}</strong>
            <p>{settings.tagline}</p>
          </div>
        </div>
        <nav aria-label="Footer navigation">
          {publicNavigation.map((item) => (
            <PublicLink key={item.href} href={item.href} onNavigate={onNavigate}>
              {item.label}
            </PublicLink>
          ))}
        </nav>
        <p className="public-footer__legal">
          Pokémon and related names are trademarks of their respective owners.
          {` ${settings.businessName}`} is an independent retailer.
        </p>
      </div>
    </footer>
  );
}

export default PublicSite;
