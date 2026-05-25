"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  Input,
} from "@cms0/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { normalizeRedirectTarget } from "@/lib/auth/route-intent";

type SignupInvitation = {
  email: string;
  id: string;
  organizationName: string;
  role: string;
};

const formatFieldErrors = (errors: ReadonlyArray<unknown>) =>
  errors
    .map((error) => {
      if (typeof error === "string") {
        return error;
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        return error.message;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));

export function SignupForm({
  googleEnabled,
  invitation,
  redirect,
}: Readonly<{
  googleEnabled: boolean;
  invitation: SignupInvitation;
  redirect?: string | null;
}>) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const redirectTo = React.useMemo(
    () => normalizeRedirectTarget(redirect),
    [redirect],
  );

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  const signUpMutation = useMutation({
    mutationFn: async (value: { email: string; name: string; password: string }) => {
      let nextUrl: string | null = null;
      const body = {
        callbackURL: redirectTo,
        email: value.email,
        invitationId: invitation.id,
        name: value.name,
        password: value.password,
      } as Parameters<typeof authClient.signUp.email>[0] & {
        invitationId: string;
      };

      await authClient.signUp.email(
        body,
        {
          onError(context) {
            throw new Error(context.error.message);
          },
          onSuccess(context) {
            nextUrl = context.data?.url ?? redirectTo;
          },
        },
      );

      return nextUrl ?? redirectTo;
    },
    onError(error) {
      setFormError(error.message);
    },
    onSuccess(nextUrl) {
      setFormError(null);
      router.push(nextUrl as Route);
      router.refresh();
    },
  });

  const googleSignUpMutation = useMutation({
    mutationFn: async () => {
      let nextUrl: string | null = null;
      const signupUrl = `/signup?invitationId=${encodeURIComponent(invitation.id)}&redirect=${encodeURIComponent(redirectTo)}`;

      await authClient.signIn.social(
        {
          additionalData: {
            invitationId: invitation.id,
          },
          callbackURL: redirectTo,
          errorCallbackURL: signupUrl,
          newUserCallbackURL: redirectTo,
          provider: "google",
          requestSignUp: true,
        },
        {
          onError(context) {
            throw new Error(context.error.message);
          },
          onSuccess(context) {
            nextUrl = context.data?.url ?? null;
          },
        },
      );

      return nextUrl;
    },
    onError(error) {
      setFormError(error.message);
    },
    onSuccess(nextUrl) {
      setFormError(null);
      if (nextUrl) {
        window.location.assign(nextUrl);
      }
    },
  });

  const form = useForm({
    defaultValues: {
      email: invitation.email,
      name: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      await signUpMutation.mutateAsync(value);
    },
  });

  return (
    <form
      className="flex flex-col gap-6"
      data-hydrated={isHydrated ? "true" : "false"}
      id="signup-form"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Join {invitation.organizationName} as {invitation.role}.
          </p>
        </div>
        <form.Field
          name="name"
          validators={{
            onBlur: ({ value }) =>
              value.trim().length >= 2 ? undefined : "Name must be at least 2 characters.",
          }}
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="selfhost-signup-name">Name</FieldLabel>
                <Input
                  id="selfhost-signup-name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="John Doe"
                />
                {isInvalid ? (
                  <FieldError>{formatFieldErrors(field.state.meta.errors).join(" ")}</FieldError>
                ) : null}
              </Field>
            );
          }}
        />
        <form.Field
          name="email"
          validators={{
            onBlur: ({ value }) =>
              value.includes("@") ? undefined : "Enter a valid email address.",
          }}
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="selfhost-signup-email">Email</FieldLabel>
                <Input
                  id="selfhost-signup-email"
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={() => field.handleChange(invitation.email)}
                  aria-invalid={isInvalid}
                  readOnly
                  placeholder="m@example.com"
                />
                {isInvalid ? (
                  <FieldError>{formatFieldErrors(field.state.meta.errors).join(" ")}</FieldError>
                ) : null}
              </Field>
            );
          }}
        />
        <form.Field
          name="password"
          validators={{
            onBlur: ({ value }) =>
              value.length >= 8 ? undefined : "Password must be at least 8 characters.",
          }}
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="selfhost-signup-password">Password</FieldLabel>
                <Input
                  id="selfhost-signup-password"
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid ? (
                  <FieldError>{formatFieldErrors(field.state.meta.errors).join(" ")}</FieldError>
                ) : null}
              </Field>
            );
          }}
        />
      </FieldGroup>
      <div className="flex flex-col gap-3">
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              disabled={
                !isHydrated ||
                !canSubmit ||
                isSubmitting ||
                signUpMutation.isPending
              }
            >
              {isSubmitting || signUpMutation.isPending
                ? "Creating account..."
                : "Create account"}
            </Button>
          )}
        />
        {googleEnabled ? (
          <>
            <FieldSeparator>Or continue with</FieldSeparator>
            <Button
              variant="outline"
              type="button"
              disabled={!isHydrated || googleSignUpMutation.isPending}
              onClick={() => void googleSignUpMutation.mutateAsync()}
            >
              {googleSignUpMutation.isPending
                ? "Continuing..."
                : "Continue with Google"}
            </Button>
          </>
        ) : null}
        <FieldDescription className="text-center">
          {formError ? <span className="text-destructive">{formError}</span> : null}
        </FieldDescription>
      </div>
    </form>
  );
}
