# @cms0/transactional

Transactional email package with provider-agnostic transports and React Email templates.

## Installation

This package is part of the package graph. Install dependencies from the root:

```bash
pnpm install
```

## Configuration

Configure one of the supported transports in the consuming app:

```bash
CMS0_EMAIL_TRANSPORT=log
# or:
CMS0_EMAIL_TRANSPORT=smtp
# or:
CMS0_EMAIL_TRANSPORT=plunk
CMS0_EMAIL_PLUNK_SECRET_KEY=sk_your_secret_key
```

## Usage

Import and use the email sending functions:

```typescript
import {
  sendTeamInvite,
  sendResetPassword,
} from '@cms0/transactional';

// Send a team invitation
await sendTeamInvite('user@example.com', {
  teamName: 'Engineering Team',
  inviterName: 'John Doe',
  inviteUrl: 'https://app.example.com/accept-invite?token=xyz',
  recipientEmail: 'user@example.com',
});

// Send a password reset email
await sendResetPassword('user@example.com', {
  resetUrl: 'https://app.example.com/reset-password?token=xyz',
  userName: 'John', // optional
});
```

### Custom Options

All send functions accept an optional third parameter for custom options:

```typescript
await sendTeamInvite(
  'user@example.com',
  {
    teamName: 'Engineering Team',
    inviterName: 'John Doe',
    inviteUrl: 'https://app.example.com/accept-invite?token=xyz',
    recipientEmail: 'user@example.com',
  },
  {
    from: { name: 'Support Team', email: 'support@example.com' },
    replyTo: 'support@example.com',
    headers: {
      'X-Custom-Header': 'value',
    },
  }
);
```

## Development

### Preview Emails

Start the React Email development server to preview all email templates:

```bash
cd packages/transactional
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000) to preview your emails.

### Build

Compile TypeScript to JavaScript:

```bash
pnpm build
```

## Email Templates

This package includes the following email templates:

1. **team-invite** - Invite users to join a team
2. **reset-password** - Password reset instructions

All templates are built using React Email components and are located in the `emails/` directory.

## API Reference

### `sendTeamInvite(to, props, options?)`

Send a team invitation email.

**Parameters:**
- `to` (string): Recipient email address
- `props` (TeamInviteProps):
  - `teamName` (string): Name of the team
  - `inviterName` (string): Name of the person sending the invite
  - `inviteUrl` (string): URL to accept the invitation
  - `recipientEmail` (string): Email address of the recipient
- `options` (SendEmailOptions, optional): Custom email options

### `sendResetPassword(to, props, options?)`

Send a password reset email.

**Parameters:**
- `to` (string): Recipient email address
- `props` (ResetPasswordProps):
  - `resetUrl` (string): URL to reset password
  - `userName` (string, optional): Name of the user
- `options` (SendEmailOptions, optional): Custom email options

## Advanced Usage

### Custom Email Service

You can create and set a custom default email service:

```typescript
import { createEmailService, setDefaultEmailService } from '@cms0/transactional';

const customService = createEmailService({
  transport: { kind: 'log' },
  defaultFrom: 'no-reply@example.com',
});

setDefaultEmailService(customService);
```
