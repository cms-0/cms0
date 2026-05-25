import type { EmailAddress, EmailTransportConfig } from "@cms0/shared";

export type EmailAddressLike = string | EmailAddress;

export type EmailRecipient =
  | EmailAddressLike
  | Array<EmailAddressLike>;

export interface EmailAttachment {
  content: string;
  contentType: string;
  filename: string;
}

export interface EmailMessage {
  attachments?: EmailAttachment[];
  from?: EmailAddressLike;
  headers?: Record<string, string>;
  html: string;
  replyTo?: EmailAddressLike;
  subject: string;
  text?: string;
  to: EmailRecipient;
}

export interface EmailSendResult {
  accepted: boolean;
  messageId: string | null;
  provider: EmailTransportConfig["kind"];
}

export interface EmailTransport {
  readonly kind: EmailTransportConfig["kind"];
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailService {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailServiceConfig {
  defaultFrom?: EmailAddressLike;
  defaultReplyTo?: EmailAddressLike;
  transport: EmailTransportConfig;
}

// Email template props
export interface TeamInviteProps {
  teamName: string;
  inviterName: string;
  inviteUrl: string;
  recipientEmail: string;
}

export interface ResetPasswordProps {
  resetUrl: string;
  userName?: string;
}

// Send email options
export interface SendEmailOptions {
  from?: EmailAddressLike;
  replyTo?: EmailAddressLike;
  service?: EmailService;
  headers?: Record<string, string>;
}
