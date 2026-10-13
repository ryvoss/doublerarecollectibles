import { Resend } from "resend";
import {
  publicContactTopicLabel,
  type PublicContactSubmission,
} from "../../shared/publicContact";

export type ContactEmailMessage = Omit<PublicContactSubmission, "companyWebsite">;

export interface ContactEmailService {
  send(message: ContactEmailMessage): Promise<void>;
}

export type ContactEmailProviderPayload = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
};

type ContactEmailProvider = {
  send(payload: ContactEmailProviderPayload): Promise<{ error: unknown | null }>;
};

type ContactEmailProviderFactory = (apiKey: string) => ContactEmailProvider;

export class ContactEmailDeliveryError extends Error {
  readonly code = "CONTACT_EMAIL_DELIVERY_FAILED";

  constructor() {
    super("Contact email delivery failed");
    this.name = "ContactEmailDeliveryError";
  }
}

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new ContactEmailDeliveryError();
  return value;
}

function plainTextBody(message: ContactEmailMessage) {
  return [
    "New website contact submission",
    "",
    `Topic: ${publicContactTopicLabel(message.topic)}`,
    `Name: ${message.name}`,
    `Email: ${message.email}`,
    "",
    "Message:",
    message.message,
  ].join("\n");
}

const createResendProvider: ContactEmailProviderFactory = (apiKey) => {
  const resend = new Resend(apiKey);
  return { send: payload => resend.emails.send(payload) };
};

export function createResendContactEmailService(
  createProvider: ContactEmailProviderFactory = createResendProvider,
): ContactEmailService {
  return {
    async send(message) {
      const apiKey = requiredEnvironmentValue("RESEND_API_KEY");
      const from = requiredEnvironmentValue("CONTACT_FORM_FROM_EMAIL");
      const to = requiredEnvironmentValue("CONTACT_FORM_TO_EMAIL");
      const provider = createProvider(apiKey);

      try {
        const result = await provider.send({
          from,
          to,
          replyTo: message.email,
          subject: `[Website contact] ${publicContactTopicLabel(message.topic)}`,
          text: plainTextBody(message),
        });
        if (result.error) throw new ContactEmailDeliveryError();
      } catch {
        // Provider details can contain request or configuration data. Keep the
        // route-facing error deliberately generic and do not retry here.
        throw new ContactEmailDeliveryError();
      }
    },
  };
}
