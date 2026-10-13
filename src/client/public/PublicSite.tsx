import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import FeaturedInventorySection from "./FeaturedInventorySection";
import PublicInventoryPage from "./PublicInventoryPage";
import {
  EMPTY_PUBLIC_SITE_ASSETS,
  PUBLIC_SITE_DEFAULTS,
  type PublicSiteConfiguration,
  type PublicSiteSettings,
} from "../../shared/publicSite";
import {
  PUBLIC_CONTACT_TOPIC_OPTIONS,
  validatePublicContactSubmission,
  type PublicContactFieldErrors,
  type PublicContactSubmission,
} from "../../shared/publicContact";
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

const knownPublicPaths = new Set([
  "/",
  "/inventory",
  "/shows",
  "/buy-sell-trade",
  "/contact",
]);

const EMPTY_CONTACT_FORM: PublicContactSubmission = {
  name: "",
  email: "",
  topic: "GENERAL",
  message: "",
  companyWebsite: "",
};

function PublicLink({ children, className, href, onNavigate }: PublicLinkProps) {
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
      <span className="public-brand__mark public-brand__mark--compact" aria-hidden="true">
        DR
      </span>
    );
  }

  return (
    <span className={`public-brand__mark${logoUrl ? " has-image" : ""}`}>
      {logoUrl ? <img src={logoUrl} alt={`${businessName} logo`} /> : "DR"}
    </span>
  );
}

function PublicSite({ pathname, onNavigate }: PublicSiteProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const [siteConfiguration, setSiteConfiguration] = useState<PublicSiteConfiguration>({
    settings: { ...PUBLIC_SITE_DEFAULTS },
    assets: { ...EMPTY_PUBLIC_SITE_ASSETS },
  });
  const { assets, settings } = siteConfiguration;

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
          : pathname === "/buy-sell-trade"
            ? "Buy / Sell / Trade"
            : "";

    document.title = pageLabel
      ? `${pageLabel} | ${settings.businessName}`
      : settings.businessName;
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

  return (
    <div className="public-site">
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
                className={pathname === item.href ? "is-active" : undefined}
                href={item.href}
                onNavigate={onNavigate}
              >
                {item.label}
              </PublicLink>
            ))}
          </nav>

          <div className="public-header__actions">
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
          </nav>
        )}
      </header>

      <main>
        {pathname === "/" && (
          <HomePage
            heroImageUrl={assets.heroImageUrl}
            onNavigate={onNavigate}
            settings={settings}
          />
        )}
        {pathname === "/inventory" && <PublicInventoryPage settings={settings} />}
        {pathname === "/shows" && (
          <ShowsPage onNavigate={onNavigate} settings={settings} />
        )}
        {pathname === "/buy-sell-trade" && (
          <BuySellTradePage onNavigate={onNavigate} settings={settings} />
        )}
        {pathname === "/contact" && <ContactPage settings={settings} />}
        {!knownPublicPaths.has(pathname) && <NotFoundPage onNavigate={onNavigate} />}
      </main>

      <PublicFooter
        logoUrl={assets.primaryLogoUrl}
        onNavigate={onNavigate}
        settings={settings}
      />
    </div>
  );
}

function HomePage({
  heroImageUrl,
  onNavigate,
  settings,
}: Pick<PublicSiteProps, "onNavigate"> & {
  heroImageUrl: string | null;
  settings: PublicSiteSettings;
}) {
  return (
    <>
      <section className="public-hero">
        <div className="public-container public-hero__layout">
          <div className="public-hero__content">
            <p className="public-kicker">{settings.tagline}</p>
            <h1>{settings.heroTitle}</h1>
            <p className="public-hero__lead">{settings.heroSubtitle}</p>
            <PublicLink
              className="public-button public-button--primary public-hero__cta"
              href="/inventory"
              onNavigate={onNavigate}
            >
              {settings.primaryCtaLabel}
              <ArrowIcon />
            </PublicLink>
          </div>

          <div className="public-hero__visual" aria-hidden="true">
            {heroImageUrl ? <img src={heroImageUrl} alt="" /> : <span>DR</span>}
          </div>
        </div>
        <div
          className="public-container public-hero__promise"
          aria-label={`${settings.businessName} service highlights`}
        >
          <span>Sealed inventory</span>
          <span>Local card shows</span>
          <span>Buy, sell, and trade</span>
        </div>
      </section>

      <FeaturedInventorySection onNavigate={onNavigate} settings={settings} />

      <section className="public-section public-section--muted">
        <div className="public-container public-bst-preview">
          <div className="public-bst-preview__copy">
            <p className="public-kicker">Your collection, your next move</p>
            <h2>{settings.buySellTradeTitle}</h2>
            <p>{settings.buySellTradeText}</p>
            <PublicLink
              className="public-button public-button--secondary"
              href="/buy-sell-trade"
              onNavigate={onNavigate}
            >
              Learn how it works
              <ArrowIcon />
            </PublicLink>
          </div>
          <ol className="public-bst-preview__steps">
            <li>
              <span>01</span>
              <div>
                <strong>Browse what is available</strong>
                <p>Start with the current public inventory.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Share your collection details</strong>
                <p>Send clear photos and what you want to sell or trade.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Connect directly</strong>
                <p>Talk through the next step by Instagram or email.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="public-contact-band">
        <div className="public-container">
          <div>
            <p className="public-kicker">Have a product or collection question?</p>
            <h2>Talk directly with {settings.businessName}.</h2>
          </div>
          <div className="public-contact-band__actions">
            <a
              className="public-button public-button--primary"
              href={settings.instagramUrl}
              target="_blank"
              rel="noreferrer"
            >
              <InstagramIcon />
              Message on Instagram
            </a>
            <PublicLink
              className="public-button public-button--secondary"
              href="/contact"
              onNavigate={onNavigate}
            >
              Contact options
            </PublicLink>
          </div>
        </div>
      </section>
    </>
  );
}

function ShowsPage({
  onNavigate,
  settings,
}: Pick<PublicSiteProps, "onNavigate"> & { settings: PublicSiteSettings }) {
  return (
    <section className="public-inner-page public-shows-page">
      <div className="public-container">
        <p className="public-kicker">Meet us in person</p>
        <h1>{settings.showsPageTitle}</h1>
        <p className="public-inner-page__lead">{settings.showsIntroText}</p>

        <div className="public-empty-state">
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
        </div>
      </div>
    </section>
  );
}

function BuySellTradePage({
  onNavigate,
  settings,
}: Pick<PublicSiteProps, "onNavigate"> & { settings: PublicSiteSettings }) {
  return (
    <section className="public-inner-page">
      <div className="public-container">
        <p className="public-kicker">Collector to collector</p>
        <h1>{settings.buySellTradeTitle}</h1>
        <p className="public-inner-page__lead">{settings.buySellTradeText}</p>

        <div className="public-bst-detail">
          <div className="public-bst-detail__bring">
            <p className="public-kicker">Start with the details</p>
            <h2>Tell us what you have in mind.</h2>
            <ul>
              <li>Sealed products you want to sell or trade</li>
              <li>Clear photos and a short collection summary</li>
              <li>Products you are looking for from our inventory</li>
            </ul>
          </div>

          <ol className="public-bst-detail__process">
            <li>
              <span>01</span>
              <div>
                <h2>Send the details</h2>
                <p>Use Instagram or email to share the product or collection information.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h2>Talk through the options</h2>
                <p>We will confirm what is available and discuss a practical next step.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h2>Connect in person</h2>
                <p>When it makes sense, arrange to meet at a card show or agreed location.</p>
              </div>
            </li>
          </ol>
        </div>

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

function ContactPage({ settings }: { settings: PublicSiteSettings }) {
  const [form, setForm] = useState<PublicContactSubmission>({ ...EMPTY_CONTACT_FORM });
  const [fieldErrors, setFieldErrors] = useState<PublicContactFieldErrors>({});
  const [submission, setSubmission] = useState<{
    kind: "idle" | "pending" | "success" | "error";
    message: string;
  }>({ kind: "idle", message: "" });

  function updateField<K extends keyof PublicContactSubmission>(
    field: K,
    value: PublicContactSubmission[K],
  ) {
    setForm(current => ({ ...current, [field]: value }));
    setFieldErrors(current => ({ ...current, [field]: undefined }));
    if (submission.kind !== "idle") setSubmission({ kind: "idle", message: "" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.kind === "pending") return;
    const validation = validatePublicContactSubmission(form);
    if (validation.kind === "invalid") {
      setFieldErrors(validation.fieldErrors);
      setSubmission({ kind: "error", message: "Please check the highlighted fields." });
      return;
    }

    setFieldErrors({});
    setSubmission({ kind: "pending", message: "Sending your message…" });
    try {
      const response = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        setSubmission({
          kind: "error",
          message: body.error ?? "Your message could not be sent right now. Please try again later.",
        });
        return;
      }

      setForm({ ...EMPTY_CONTACT_FORM });
      setSubmission({
        kind: "success",
        message: body.message ?? "Thanks. Your message has been sent.",
      });
    } catch {
      setSubmission({
        kind: "error",
        message: "Your message could not be sent right now. Please try again later.",
      });
    }
  }

  return (
    <section className="public-inner-page public-contact-page">
      <div className="public-container">
        <p className="public-kicker">Let’s talk collectibles</p>
        <h1>{settings.contactPageTitle}</h1>
        <p className="public-inner-page__lead">{settings.contactText}</p>

        <div className="public-contact-layout">
          <aside className="public-contact-options" aria-labelledby="contact-options-title">
            <div>
              <p className="public-kicker">Direct contact</p>
              <h2 id="contact-options-title">Other ways to reach us</h2>
            </div>
            <div className="public-contact-list">
              <a
                className="public-contact-card"
                href={settings.instagramUrl}
                target="_blank"
                rel="noreferrer"
              >
                <InstagramIcon />
                <div>
                  <span>Instagram</span>
                  <strong>Message {settings.businessName}</strong>
                  <p>Ask about products, collections, or current show plans.</p>
                </div>
                <ArrowIcon />
              </a>
              {settings.contactEmail && (
                <a className="public-contact-card" href={`mailto:${settings.contactEmail}`}>
                  <span className="public-contact-card__email" aria-hidden="true">@</span>
                  <div>
                    <span>Email</span>
                    <strong>{settings.contactEmail}</strong>
                    <p>Send a product or collection question directly.</p>
                  </div>
                  <ArrowIcon />
                </a>
              )}
            </div>
          </aside>

          <form className="public-contact-form" noValidate onSubmit={handleSubmit}>
            <div className="public-contact-form__heading">
              <p className="public-kicker">Send a message</p>
              <h2>What can we help with?</h2>
              <p>Tell us what you are looking for and we will get back to you.</p>
            </div>

            <div className="public-contact-form__grid">
              <div className="public-contact-field">
                <label htmlFor="contact-name">Name</label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  value={form.name}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
                  onChange={event => updateField("name", event.target.value)}
                />
                {fieldErrors.name && <span id="contact-name-error" className="public-contact-field__error">{fieldErrors.name}</span>}
              </div>

              <div className="public-contact-field">
                <label htmlFor="contact-email">Email</label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  value={form.email}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
                  onChange={event => updateField("email", event.target.value)}
                />
                {fieldErrors.email && <span id="contact-email-error" className="public-contact-field__error">{fieldErrors.email}</span>}
              </div>

              <div className="public-contact-field public-contact-field--wide">
                <label htmlFor="contact-topic">Topic</label>
                <select
                  id="contact-topic"
                  name="topic"
                  value={form.topic}
                  aria-invalid={Boolean(fieldErrors.topic)}
                  aria-describedby={fieldErrors.topic ? "contact-topic-error" : undefined}
                  onChange={event => updateField("topic", event.target.value as PublicContactSubmission["topic"])}
                >
                  {PUBLIC_CONTACT_TOPIC_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {fieldErrors.topic && <span id="contact-topic-error" className="public-contact-field__error">{fieldErrors.topic}</span>}
              </div>

              <div className="public-contact-field public-contact-field--wide">
                <div className="public-contact-field__label-row">
                  <label htmlFor="contact-message">Message</label>
                  <span>{form.message.length.toLocaleString()} / 4,000</span>
                </div>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={7}
                  maxLength={4_000}
                  value={form.message}
                  aria-invalid={Boolean(fieldErrors.message)}
                  aria-describedby={fieldErrors.message ? "contact-message-error" : undefined}
                  onChange={event => updateField("message", event.target.value)}
                />
                {fieldErrors.message && <span id="contact-message-error" className="public-contact-field__error">{fieldErrors.message}</span>}
              </div>

              <div className="public-contact-honeypot" aria-hidden="true">
                <label htmlFor="contact-company-website">Company website</label>
                <input
                  id="contact-company-website"
                  name="companyWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.companyWebsite}
                  onChange={event => updateField("companyWebsite", event.target.value)}
                />
              </div>
            </div>

            <button
              className="public-button public-button--primary public-contact-form__submit"
              type="submit"
              disabled={submission.kind === "pending"}
            >
              {submission.kind === "pending" ? "Sending…" : "Send message"}
              {submission.kind !== "pending" && <ArrowIcon />}
            </button>

            <div
              className={`public-contact-form__status${submission.kind === "error" ? " is-error" : ""}${submission.kind === "success" ? " is-success" : ""}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {submission.message}
            </div>
          </form>
        </div>
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
