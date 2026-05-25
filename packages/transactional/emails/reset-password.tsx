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

interface ResetPasswordEmailProps {
  resetUrl: string;
  userName?: string;
}

export default function ResetPasswordEmail({
  resetUrl = "https://example.com/reset-password",
  userName = "there",
}: ResetPasswordEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={content}>
            <Text style={heading}>Reset your password</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              We received a request to reset your password. Click the button below to create a new
              password:
            </Text>
            <Button href={resetUrl} style={button}>
              Reset Password
            </Button>
            <Hr style={hr} />
            <Text style={paragraph}>
              This link will expire in 1 hour for security reasons.
            </Text>
            <Text style={footer}>
              If you didn't request a password reset, you can safely ignore this email. Your
              password will not be changed.
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
