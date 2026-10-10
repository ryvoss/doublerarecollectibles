import {
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import PublicInventoryPage from "./PublicInventoryPage";
import FeaturedInventorySection from "./FeaturedInventorySection";
import {
  EMPTY_PUBLIC_SITE_ASSETS,
  PUBLIC_SITE_DEFAULTS,
  type PublicSiteConfiguration,
  type PublicSiteSettings,
} from "../../shared/publicSite";
import "./PublicSite.css";

type PublicSiteProps = {
  pathname: string;
  onNavigate: (path: string) => void;
};

type PublicLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
  onNavigate: (path: string) => void;
};

const publicNavigation = [
  { href: "/inventory", label: "Inventory" },
  { href: "/shows", label: "Shows" },
  { href: "/buy-sell-trade", label: "Buy / Sell / Trade" },
  { href: "/contact", label: "Contact" },
];

const knownPublicPaths = new Set(["/", "/inventory", "/shows", "/buy-sell-trade", "/contact"]);

function PublicLink({
  children,
  className,
  href,
  onNavigate,
}: PublicLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onNavigate(href);
  }

  return (
    <a className={className} href={href} onClick={handleClick}>
      {children}
    </a>
  );
}

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

function PublicBrandMark({ businessName, logoUrl }: { businessName: string; logoUrl: string | null }) {
  return <span className={`public-brand__mark${logoUrl ? " has-image" : ""}`}>
    {logoUrl ? <img src={logoUrl} alt={`${businessName} logo`} /> : "DR"}
  </span>;
}

function PublicSite({ pathname, onNavigate }: PublicSiteProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [siteConfiguration, setSiteConfiguration] = useState<PublicSiteConfiguration>({
    settings: { ...PUBLIC_SITE_DEFAULTS },
    assets: { ...EMPTY_PUBLIC_SITE_ASSETS },
  });
  const { assets, settings } = siteConfiguration;

  useEffect(() => {
    const controller = new AbortController();
    async function loadSiteConfiguration() {
      try {
        const response = await fetch("/api/public/site", { signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as PublicSiteConfiguration;
        if (!controller.signal.aborted && body?.settings && body?.assets) setSiteConfiguration(body);
      } catch (error) {
        if (!controller.signal.aborted) console.error("Public site configuration loading failed:", error);
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
          : pathname === "/buy-sell-trade"
            ? "Buy / Sell / Trade"
            : "";
    document.title = pageLabel ? `${pageLabel} | ${settings.businessName}` : settings.businessName;
    document.querySelector('meta[name="description"]')?.setAttribute("content", settings.heroSubtitle);
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="public-site">
      <header
        className={`public-header${compactHeader ? " public-header--compact" : ""}`}
      >
        <div className="public-header__inner">
          <PublicLink
            className="public-brand"
            href="/"
            onNavigate={onNavigate}
          >
            <PublicBrandMark businessName={settings.businessName} logoUrl={assets.primaryLogoUrl} />
            <span className="public-brand__copy">
              <strong>{settings.businessName}</strong>
              <span>{settings.tagline}</span>
            </span>
          </PublicLink>

          <nav className="public-navigation public-navigation--desktop" aria-label="Main navigation">
            {publicNavigation.map((item) => (
              <PublicLink
                key={item.href}
                className={pathname === item.href ? "is-active" : undefined}
                href={item.href}
                onNavigate={onNavigate}
              >
                {item.label}
              </PublicLink>
            ))}
          </nav>

          <div className="public-header__actions">
            <PublicLink
              className="public-shell-switch public-shell-switch--header"
              href="/admin"
              onNavigate={onNavigate}
            >
              Admin
            </PublicLink>

            <a
              className="public-instagram-link public-instagram-link--header"
              href={settings.instagramUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`${settings.businessName} on Instagram`}
            >
              <InstagramIcon />
              <span>Instagram</span>
            </a>

            <button
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

        <nav
          id="public-mobile-navigation"
          className={`public-navigation public-navigation--mobile${menuOpen ? " is-open" : ""}`}
          aria-label="Mobile navigation"
        >
          {publicNavigation.map((item) => (
            <PublicLink
              key={item.href}
              className={pathname === item.href ? "is-active" : undefined}
              href={item.href}
              onNavigate={onNavigate}
            >
              <span>{item.label}</span>
              <ArrowIcon />
            </PublicLink>
          ))}

          <a
            className="public-navigation__instagram"
            href={settings.instagramUrl}
            target="_blank"
            rel="noreferrer"
          >
            <InstagramIcon />
            Instagram
          </a>

          <PublicLink
            className="public-navigation__admin"
            href="/admin"
            onNavigate={onNavigate}
          >
            <span>Admin</span>
            <ArrowIcon />
          </PublicLink>
        </nav>
      </header>

      <main>
        {pathname === "/" && <HomePage onNavigate={onNavigate} settings={settings} heroImageUrl={assets.heroImageUrl} />}
        {pathname === "/inventory" && <PublicInventoryPage settings={settings} />}
        {pathname === "/shows" && (
          <PlaceholderPage
            eyebrow="Meet us in person"
            title={settings.showsPageTitle}
            description={settings.showsIntroText}
            detail="Dates, locations, and event details will appear here."
          />
        )}
        {pathname === "/buy-sell-trade" && <BuySellTradePage onNavigate={onNavigate} settings={settings} />}
        {pathname === "/contact" && <ContactPage settings={settings} />}
        {!knownPublicPaths.has(pathname) && <NotFoundPage onNavigate={onNavigate} />}
      </main>

      <PublicFooter onNavigate={onNavigate} settings={settings} logoUrl={assets.primaryLogoUrl} />
    </div>
  );
}

function HomePage({ heroImageUrl, onNavigate, settings }: Pick<PublicSiteProps, "onNavigate"> & { heroImageUrl: string | null; settings: PublicSiteSettings }) {
  return (
    <>
      <section className="public-hero">
        {heroImageUrl && <img className="public-hero__image" src={heroImageUrl} alt="" />}
        <div className="public-hero__glow" />
        <div className="public-container public-hero__content">
          <p className="public-kicker">{settings.tagline}</p>
          <h1>{settings.heroTitle}</h1>
          <p className="public-hero__lead">{settings.heroSubtitle}</p>
          <div className="public-hero__actions">
            <PublicLink
              className="public-button public-button--primary"
              href="/inventory"
              onNavigate={onNavigate}
            >
              {settings.primaryCtaLabel}
              <ArrowIcon />
            </PublicLink>
            <PublicLink
              className="public-button public-button--secondary"
              href="/shows"
              onNavigate={onNavigate}
            >
              {settings.secondaryCtaLabel}
            </PublicLink>
          </div>
          <div className="public-hero__promise" aria-label={`${settings.businessName} service values`}>
            <span>Authentic products</span>
            <span>Collector focused</span>
            <span>Local show service</span>
          </div>
        </div>
        <div className="public-hero__monogram" aria-hidden="true">DR</div>
      </section>

      <FeaturedInventorySection onNavigate={onNavigate} settings={settings} />

      <section className="public-section public-section--muted">
        <div className="public-container public-show-feature">
          <div className="public-show-feature__date" aria-hidden="true">
            <span>Next</span>
            <strong>SHOW</strong>
          </div>
          <div className="public-show-feature__copy">
            <p className="public-kicker">See {settings.businessName} in person</p>
            <h2>Our next show is on the way.</h2>
            <p>
              Stop by to browse sealed inventory, talk Pokémon, or bring in a
              collection you would like us to evaluate.
            </p>
          </div>
          <PublicLink
            className="public-button public-button--secondary"
            href="/shows"
            onNavigate={onNavigate}
          >
            View show schedule
            <ArrowIcon />
          </PublicLink>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container public-split-feature">
          <div>
            <p className="public-kicker">Your collection, your next move</p>
            <h2>{settings.buySellTradeTitle}</h2>
            <p>{settings.buySellTradeText}</p>
            <PublicLink
              className="public-button public-button--primary"
              href="/buy-sell-trade"
              onNavigate={onNavigate}
            >
              Learn how it works
              <ArrowIcon />
            </PublicLink>
          </div>
          <div className="public-service-grid">
            {[
              ["Buy", "Explore sealed Pokémon products selected for collectors."],
              ["Sell", "Tell us what you have and what you are looking to sell."],
              ["Trade", "Turn part of your collection into something new."],
            ].map(([title, copy]) => (
              <article key={title}>
                <span>{title.slice(0, 1)}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-contact-band">
        <div className="public-container">
          <div>
            <p className="public-kicker">Stay connected</p>
            <h2>See what’s new at {settings.businessName}.</h2>
          </div>
          <div className="public-contact-band__actions">
            <a
              className="public-button public-button--primary"
              href={settings.instagramUrl}
              target="_blank"
              rel="noreferrer"
            >
              <InstagramIcon />
              Follow on Instagram
            </a>
            <PublicLink
              className="public-button public-button--secondary"
              href="/contact"
              onNavigate={onNavigate}
            >
              Contact us
            </PublicLink>
          </div>
        </div>
      </section>
    </>
  );
}

function PlaceholderPage({
  description,
  detail,
  eyebrow,
  title,
}: {
  description: string;
  detail: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="public-inner-page">
      <div className="public-container">
        <p className="public-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="public-inner-page__lead">{description}</p>
        <div className="public-coming-soon">
          <span>Coming soon</span>
          <h2>We’re building this part of the experience.</h2>
          <p>{detail}</p>
        </div>
      </div>
    </section>
  );
}

function BuySellTradePage({ onNavigate, settings }: Pick<PublicSiteProps, "onNavigate"> & { settings: PublicSiteSettings }) {
  return (
    <section className="public-inner-page">
      <div className="public-container">
        <p className="public-kicker">Collector to collector</p>
        <h1>Buy / Sell / Trade</h1>
        <p className="public-inner-page__lead">
          Whether you are starting a collection or making room for the next one,
          {settings.businessName} is ready to help.
        </p>
        <div className="public-info-grid">
          {[
            ["Buy", "Browse a curated selection of sealed Pokémon products."],
            ["Sell", "Share the details of your collection for a straightforward conversation."],
            ["Trade", "Bring your collection to a show and explore your options in person."],
          ].map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h2>{title}</h2>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <PublicLink
          className="public-button public-button--primary"
          href="/contact"
          onNavigate={onNavigate}
        >
          Start a conversation
          <ArrowIcon />
        </PublicLink>
      </div>
    </section>
  );
}

function ContactPage({ settings }: { settings: PublicSiteSettings }) {
  return (
    <section className="public-inner-page">
      <div className="public-container public-contact-page">
        <div>
          <p className="public-kicker">Let’s talk Pokémon</p>
          <h1>{settings.contactPageTitle}</h1>
          <p className="public-inner-page__lead">{settings.contactText}</p>
        </div>
        <a
          className="public-contact-card"
          href={settings.instagramUrl}
          target="_blank"
          rel="noreferrer"
        >
          <InstagramIcon />
          <div>
            <span>Social</span>
            <strong>Message us on Instagram</strong>
            <p>Follow new arrivals, show updates, and collection highlights.</p>
          </div>
          <ArrowIcon />
        </a>
        {settings.contactEmail && <a className="public-contact-card" href={`mailto:${settings.contactEmail}`}>
          <span className="public-contact-card__email" aria-hidden="true">@</span>
          <div>
            <span>Email</span>
            <strong>{settings.contactEmail}</strong>
            <p>Send a product or collection question directly.</p>
          </div>
          <ArrowIcon />
        </a>}
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

function PublicFooter({ logoUrl, onNavigate, settings }: Pick<PublicSiteProps, "onNavigate"> & { logoUrl: string | null; settings: PublicSiteSettings }) {
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
          {settings.businessName} is an independent retailer.
        </p>
      </div>
    </footer>
  );
}

export default PublicSite;
