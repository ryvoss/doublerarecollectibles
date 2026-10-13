export const PUBLIC_CONTACT_TOPIC_OPTIONS = [
  { value: "BUYING", label: "Buying" },
  { value: "SELLING", label: "Selling" },
  { value: "TRADING", label: "Trading" },
  { value: "PRODUCT_QUESTION", label: "Product question" },
  { value: "SHOW_EVENT_QUESTION", label: "Show/event question" },
  { value: "GENERAL", label: "General" },
] as const;

export type PublicContactTopic = typeof PUBLIC_CONTACT_TOPIC_OPTIONS[number]["value"];

export type PublicContactSubmission = {
  name: string;
  email: string;
  topic: PublicContactTopic;
  message: string;
  companyWebsite: string;
};

export type PublicContactFieldErrors = Partial<Record<keyof PublicContactSubmission, string>>;

type PublicContactValidationResult =
  | { kind: "valid"; value: PublicContactSubmission }
  | { kind: "honeypot" }
  | { kind: "invalid"; fieldErrors: PublicContactFieldErrors };

const ALLOWED_FIELDS = new Set<keyof PublicContactSubmission>([
  "name",
  "email",
  "topic",
  "message",
  "companyWebsite",
]);
const TOPICS = new Set<string>(PUBLIC_CONTACT_TOPIC_OPTIONS.map(option => option.value));
const HEADER_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MESSAGE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const EMAIL_LOCAL_CHARACTERS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function isValidPublicContactEmail(value: string) {
  if (value.length === 0 || value.length > 254 || HEADER_CONTROL_CHARACTERS.test(value)) return false;
  const atIndex = value.lastIndexOf("@");
  if (atIndex <= 0 || atIndex !== value.indexOf("@")) return false;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (
    local.length > 64 ||
    !EMAIL_LOCAL_CHARACTERS.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.length === 0 ||
    domain.length > 253
  ) {
    return false;
  }

  const labels = domain.split(".");
  return labels.length >= 2 && labels.every(label => EMAIL_DOMAIN_LABEL.test(label));
}

export function validatePublicContactSubmission(input: unknown): PublicContactValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { kind: "invalid", fieldErrors: {} };
  }

  const record = input as Record<string, unknown>;
  if (Object.keys(record).some(key => !ALLOWED_FIELDS.has(key as keyof PublicContactSubmission))) {
    return { kind: "invalid", fieldErrors: {} };
  }

  if (record.companyWebsite !== undefined && typeof record.companyWebsite !== "string") {
    return { kind: "invalid", fieldErrors: { companyWebsite: "Invalid field." } };
  }
  if (typeof record.companyWebsite === "string" && record.companyWebsite.trim().length > 0) {
    return { kind: "honeypot" };
  }

  const errors: PublicContactFieldErrors = {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const topic = typeof record.topic === "string" ? record.topic : "";

  if (name.length === 0 || name.length > 100 || HEADER_CONTROL_CHARACTERS.test(name)) {
    errors.name = "Enter your name using 100 characters or fewer.";
  }
  if (!isValidPublicContactEmail(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!TOPICS.has(topic)) {
    errors.topic = "Choose a topic.";
  }
  if (message.length < 10 || message.length > 4_000 || MESSAGE_CONTROL_CHARACTERS.test(message)) {
    errors.message = "Enter a message between 10 and 4,000 characters.";
  }

  if (Object.keys(errors).length > 0) return { kind: "invalid", fieldErrors: errors };

  return {
    kind: "valid",
    value: {
      name,
      email,
      topic: topic as PublicContactTopic,
      message,
      companyWebsite: "",
    },
  };
}

export function publicContactTopicLabel(topic: PublicContactTopic) {
  return PUBLIC_CONTACT_TOPIC_OPTIONS.find(option => option.value === topic)?.label ?? "General";
}
