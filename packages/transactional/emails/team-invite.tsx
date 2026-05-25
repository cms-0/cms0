import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface TeamInviteEmailProps {
  teamName: string;
  inviterName: string;
  inviteUrl: string;
  recipientEmail: string;
}

export default function TeamInviteEmail({
  teamName = "Your Team",
  inviterName = "A team member",
  inviteUrl = "https://example.com/accept-invite",
  recipientEmail = "user@example.com",
}: TeamInviteEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={content}>
            <Text style={heading}>You've been invited to join a team</Text>
            <Text style={paragraph}>
              {inviterName} has invited you to join <strong>{teamName}</strong>.
            </Text>
            <Text style={paragraph}>
              Click the button below to accept the invitation and join the team:
            </Text>
            <Button href={inviteUrl} style={button}>
              Accept Invitation
            </Button>
            <Hr style={hr} />
            <Text style={footer}>
              This invitation was sent to {recipientEmail}. If you weren't expecting this
              invitation, you can safely ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const content = {
  padding: "0 48px",
};

const heading = {
  fontSize: "32px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#484848",
  padding: "17px 0 0",
};

const paragraph = {
  margin: "0 0 15px",
  fontSize: "15px",
  lineHeight: "1.4",
  color: "#3c4149",
};

const button = {
  backgroundColor: "#000000",
  borderRadius: "5px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  width: "100%",
  padding: "12px",
  margin: "20px 0",
};

const hr = {
  borderColor: "#dfe1e4",
  margin: "42px 0 26px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
};
