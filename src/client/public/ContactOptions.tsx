import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { PublicInventoryItem } from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import {
  PUBLIC_CONTACT_TOPIC_OPTIONS,
  validatePublicContactSubmission,
  type PublicContactFieldErrors,
  type PublicContactSubmission,
} from "../../shared/publicContact";

export type ContactProductContext = {
  name: string;
  price: string;
  availability: string;
};

export type ContactOpenHandler = (
  trigger: HTMLElement,
  product?: ContactProductContext,
) => void;

type ContactMethod =
  | { id: "website"; kind: "form"; label: string }
  | {
      id: "email" | "instagram";
      kind: "link";
      label: string;
      description: string;
      href: string;
      external: boolean;
    };

const EMPTY_CONTACT_FORM: PublicContactSubmission = {
  name: "",
  email: "",
  topic: "GENERAL",
  message: "",
  companyWebsite: "",
};

const availabilityLabels = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
} as const;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function contactProductContext(product: PublicInventoryItem): ContactProductContext {
  return {
    name: product.name,
    price: product.displayPrice === null
      ? "Contact for price"
      : currencyFormatter.format(product.displayPrice),
    availability: availabilityLabels[product.availability],
  };
}

export function openProductContact(
  onOpen: ContactOpenHandler,
  product: PublicInventoryItem,
  trigger: HTMLElement,
) {
  onOpen(trigger, contactProductContext(product));
}

export function createContactInitialSubmission(
  product?: ContactProductContext,
): PublicContactSubmission {
  if (!product) return { ...EMPTY_CONTACT_FORM };
  return {
    ...EMPTY_CONTACT_FORM,
    topic: "PRODUCT_QUESTION",
    message: `I'm interested in ${product.name} — ${product.price}.`,
  };
}

export function buildContactMethods(
  settings: PublicSiteSettings,
  product?: ContactProductContext,
): ContactMethod[] {
  const methods: ContactMethod[] = [
    { id: "website", kind: "form", label: "Website contact form" },
  ];
  if (settings.contactEmail.trim()) {
    const subject = product
      ? `Interested in ${product.name} - ${settings.businessName}`
      : `Website inquiry - ${settings.businessName}`;
    const body = product
      ? [
          `Hi ${settings.businessName},`,
          "",
          `I'm interested in ${product.name}.`,
          `Listed price: ${product.price}`,
          `Availability: ${product.availability}`,
          "",
          "Please let me know the next steps.",
        ].join("\n")
      : `Hi ${settings.businessName},\n\nI'd like to get in touch.`;
    methods.push({
      id: "email",
      kind: "link",
      label: "Email",
      description: settings.contactEmail,
      href: `mailto:${settings.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      external: false,
    });
  }
  if (settings.instagramUrl.trim()) {
    methods.push({
      id: "instagram",
      kind: "link",
      label: "Instagram",
      description: `Message ${settings.businessName}`,
      href: settings.instagramUrl,
      external: true,
    });
  }
  return methods;
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.4" cy="6.7" r="1" />
    </svg>
  );
}

function ContactMethodIcon({ id }: { id: "email" | "instagram" }) {
  return id === "email" ? <EmailIcon /> : <InstagramIcon />;
}

export function HeaderContactAction({ onOpen }: { onOpen: ContactOpenHandler }) {
  return (
    <button
      className="public-contact-trigger"
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      Contact
    </button>
  );
}

function ContactForm({ product }: { product?: ContactProductContext }) {
  const fieldId = useId();
  const ids = {
    name: `${fieldId}-name`,
    nameError: `${fieldId}-name-error`,
    email: `${fieldId}-email`,
    emailError: `${fieldId}-email-error`,
    topic: `${fieldId}-topic`,
    topicError: `${fieldId}-topic-error`,
    message: `${fieldId}-message`,
    messageError: `${fieldId}-message-error`,
    honeypot: `${fieldId}-company-website`,
  };
  const [form, setForm] = useState<PublicContactSubmission>(() =>
    createContactInitialSubmission(product)
  );
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

      setForm({
        ...EMPTY_CONTACT_FORM,
        topic: product ? "PRODUCT_QUESTION" : "GENERAL",
      });
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
    <form className="public-contact-form" noValidate onSubmit={handleSubmit}>
      <div className="public-contact-form__heading">
        <p className="public-kicker">Send a message</p>
        <h2>What can we help with?</h2>
        <p>Tell us what you are looking for and we will get back to you.</p>
      </div>

      <div className="public-contact-form__grid">
        <div className="public-contact-field">
          <label htmlFor={ids.name}>Name</label>
          <input
            id={ids.name}
            name="name"
            type="text"
            autoComplete="name"
            maxLength={100}
            value={form.name}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? ids.nameError : undefined}
            onChange={event => updateField("name", event.target.value)}
          />
          {fieldErrors.name && <span id={ids.nameError} className="public-contact-field__error">{fieldErrors.name}</span>}
        </div>

        <div className="public-contact-field">
          <label htmlFor={ids.email}>Email</label>
          <input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={form.email}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? ids.emailError : undefined}
            onChange={event => updateField("email", event.target.value)}
          />
          {fieldErrors.email && <span id={ids.emailError} className="public-contact-field__error">{fieldErrors.email}</span>}
        </div>

        <div className="public-contact-field public-contact-field--wide">
          <label htmlFor={ids.topic}>Topic</label>
          <select
            id={ids.topic}
            name="topic"
            value={form.topic}
            aria-invalid={Boolean(fieldErrors.topic)}
            aria-describedby={fieldErrors.topic ? ids.topicError : undefined}
            onChange={event => updateField("topic", event.target.value as PublicContactSubmission["topic"])}
          >
            {PUBLIC_CONTACT_TOPIC_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {fieldErrors.topic && <span id={ids.topicError} className="public-contact-field__error">{fieldErrors.topic}</span>}
        </div>

        <div className="public-contact-field public-contact-field--wide">
          <div className="public-contact-field__label-row">
            <label htmlFor={ids.message}>Message</label>
            <span>{form.message.length.toLocaleString()} / 4,000</span>
          </div>
          <textarea
            id={ids.message}
            name="message"
            rows={7}
            maxLength={4_000}
            value={form.message}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={fieldErrors.message ? ids.messageError : undefined}
            onChange={event => updateField("message", event.target.value)}
          />
          {fieldErrors.message && <span id={ids.messageError} className="public-contact-field__error">{fieldErrors.message}</span>}
        </div>

        <div className="public-contact-honeypot" aria-hidden="true">
          <label htmlFor={ids.honeypot}>Company website</label>
          <input
            id={ids.honeypot}
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
  );
}

function ContactAlternatives({ methods }: { methods: ContactMethod[] }) {
  const headingId = useId();
  const alternatives = methods.filter(
    (method): method is Extract<ContactMethod, { kind: "link" }> => method.kind === "link"
  );
  if (alternatives.length === 0) return null;

  return (
    <aside className="public-contact-options" aria-labelledby={headingId}>
      <div>
        <p className="public-kicker">Other ways to connect</p>
        <h2 id={headingId}>Contact options</h2>
      </div>
      <div className="public-contact-list">
        {alternatives.map(method => (
          <a
            key={method.id}
            className="public-contact-card public-contact-method-link"
            href={method.href}
            target={method.external ? "_blank" : undefined}
            rel={method.external ? "noreferrer" : undefined}
          >
            <ContactMethodIcon id={method.id} />
            <div>
              <span>{method.label}</span>
              <strong>{method.description}</strong>
            </div>
            <ArrowIcon />
          </a>
        ))}
      </div>
    </aside>
  );
}

export function ContactExperience({
  product,
  settings,
  surface = "page",
}: {
  product?: ContactProductContext;
  settings: PublicSiteSettings;
  surface?: "page" | "modal";
}) {
  const methods = buildContactMethods(settings, product);
  return (
    <div className={`public-contact-layout public-contact-layout--${surface}`}>
      <ContactForm product={product} />
      <ContactAlternatives methods={methods} />
    </div>
  );
}

export function ContactOptionsModal({
  onClose,
  product,
  settings,
}: {
  onClose: () => void;
  product?: ContactProductContext;
  settings: PublicSiteSettings;
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
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    <div className="public-contact-modal-backdrop" role="presentation" onMouseDown={closeFromBackdrop}>
      <div
        ref={dialogRef}
        className="public-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-contact-modal-title"
        aria-describedby="public-contact-modal-description"
        tabIndex={-1}
      >
        <header className="public-contact-modal__header">
          <div>
            <p className="public-kicker">Get in touch</p>
            <h2 id="public-contact-modal-title">Contact {settings.businessName}</h2>
            <p id="public-contact-modal-description">Send us a message or choose another contact option.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close contact options">
            &times;
          </button>
        </header>

        {product && (
          <div className="public-contact-product-context">
            <span>Interested in</span>
            <strong>{product.name} — {product.price}</strong>
            <small>{product.availability}</small>
          </div>
        )}

        <ContactExperience product={product} settings={settings} surface="modal" />
      </div>
    </div>,
    document.body,
  );
}
