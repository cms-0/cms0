import {
  createEmailService,
  createEmailTransport,
  getDefaultEmailService,
  setDefaultEmailService,
  clearDefaultEmailService,
} from "./client.js";
import {
  renderTeamInvite,
  renderResetPassword,
} from "./templates.js";
import type {
  EmailService,
  EmailServiceConfig,
  EmailSendResult,
  EmailTransport,
  TeamInviteProps,
  ResetPasswordProps,
  SendEmailOptions,
} from "./types.js";
import type { EmailTransportConfig } from "@cms0/shared";

const getEmailService = (options?: SendEmailOptions): EmailService =>
  options?.service ?? getDefaultEmailService();

/**
 * Send a team invitation email
 */
export async function sendTeamInvite(
  to: string,
  props: TeamInviteProps,
  options?: SendEmailOptions,
): Promise<EmailSendResult> {
  const service = getEmailService(options);
  const html = await renderTeamInvite(props);

  return service.send({
    from: options?.from,
    headers: options?.headers,
    html,
    replyTo: options?.replyTo,
    subject: `Join ${props.teamName}`,
    to,
  });
}

/**
 * Send a password reset email
 */
export async function sendResetPassword(
  to: string,
  props: ResetPasswordProps,
  options?: SendEmailOptions,
): Promise<EmailSendResult> {
  const service = getEmailService(options);
  const html = await renderResetPassword(props);

  return service.send({
    from: options?.from,
    headers: options?.headers,
    html,
    replyTo: options?.replyTo,
    subject: "Reset your password",
    to,
  });
}

// Export types and utilities
export type {
  EmailService,
  EmailServiceConfig,
  EmailTransport,
  EmailTransportConfig,
  TeamInviteProps,
  ResetPasswordProps,
  SendEmailOptions,
  EmailSendResult,
};

export {
  clearDefaultEmailService,
  createEmailService,
  createEmailTransport,
  setDefaultEmailService,
};
