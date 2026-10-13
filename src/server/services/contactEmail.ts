import { Resend } from "resend";
import {
  isValidPublicContactEmail,
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
  html: string;
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

const HEADER_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const PUBLIC_SITE_HOST = "doublerarecollectibles.com";

function configuredEmailAddress(value: string) {
  if (HEADER_CONTROL_CHARACTERS.test(value)) throw new ContactEmailDeliveryError();
  const mailboxMatch = value.match(/^[^<>]*<([^<>]+)>$/);
  const address = (mailboxMatch?.[1] ?? value).trim();
  if (!isValidPublicContactEmail(address)) throw new ContactEmailDeliveryError();
  return address;
}

function namedMailbox(name: string, email: string) {
  if (HEADER_CONTROL_CHARACTERS.test(name) || !isValidPublicContactEmail(email)) {
    throw new ContactEmailDeliveryError();
  }
  const safeName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${safeName}" <${email}>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextBody(message: ContactEmailMessage) {
  return [
    "New website contact",
    "",
    `Topic: ${publicContactTopicLabel(message.topic)}`,
    `Name: ${message.name}`,
    `Email: ${message.email}`,
    "",
    "Message:",
    message.message,
    "",
    `Sent from ${PUBLIC_SITE_HOST}`,
  ].join("\n");
}

function htmlBody(message: ContactEmailMessage) {
  const topic = escapeHtml(publicContactTopicLabel(message.topic));
  const name = escapeHtml(message.name);
  const email = escapeHtml(message.email);
  const visitorMessage = escapeHtml(message.message).replace(/\r?\n/g, "<br>");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f2ef;color:#202124;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f2ef;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #deded8;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#0b0c0f;border-bottom:3px solid #d8b557;">
                <div style="color:#f0cc72;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Double Rare Collectibles</div>
                <div style="margin-top:8px;color:#ffffff;font-size:24px;font-weight:700;line-height:1.25;">New website contact</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="margin-bottom:22px;">
                  <div style="margin-bottom:5px;color:#77766f;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Topic</div>
                  <div style="color:#202124;font-size:16px;font-weight:700;">${topic}</div>
                </div>
                <div style="margin-bottom:22px;">
                  <div style="margin-bottom:5px;color:#77766f;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">From</div>
                  <div style="color:#202124;font-size:16px;font-weight:700;line-height:1.45;">${name}</div>
                  <div style="color:#5f6064;font-size:14px;line-height:1.45;">${email}</div>
                </div>
                <div>
                  <div style="margin-bottom:8px;color:#77766f;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Message</div>
                  <div style="padding:18px;border-left:3px solid #d8b557;background:#f8f8f5;color:#292a2d;font-size:15px;line-height:1.65;overflow-wrap:anywhere;">${visitorMessage}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8f8f5;border-top:1px solid #e7e7e1;color:#74756f;font-size:12px;line-height:1.5;">Sent from ${PUBLIC_SITE_HOST}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
      const fromAddress = configuredEmailAddress(requiredEnvironmentValue("CONTACT_FORM_FROM_EMAIL"));
      const to = requiredEnvironmentValue("CONTACT_FORM_TO_EMAIL");
      const provider = createProvider(apiKey);

      try {
        const result = await provider.send({
          from: `Double Rare Collectibles <${fromAddress}>`,
          to,
          replyTo: namedMailbox(message.name, message.email),
          subject: `[Website contact] ${publicContactTopicLabel(message.topic)}`,
          text: plainTextBody(message),
          html: htmlBody(message),
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
