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
  cn,
} from "@cms0/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { normalizeRedirectTarget } from "@/lib/auth/route-intent";

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

type LoginFormProps = {
  emailHint?: string | null;
  googleEnabled: boolean;
  redirect?: string | null;
};

export function LoginForm({
  emailHint,
  googleEnabled,
  redirect,
}: LoginFormProps) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const redirectTo = React.useMemo(
    () => normalizeRedirectTarget(redirect),
    [redirect],
  );
  const normalizedEmailHint = emailHint?.trim() ?? "";

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  const signInMutation = useMutation({
    mutationFn: async (value: { email: string; password: string }) => {
      let nextUrl: string | null = null;

      await authClient.signIn.email(
        {
          callbackURL: redirectTo,
          email: value.email,
          password: value.password,
        },
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

  const googleSignInMutation = useMutation({
    mutationFn: async () => {
      let nextUrl: string | null = null;

      await authClient.signIn.social(
        {
          callbackURL: redirectTo,
          provider: "google",
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
      email: normalizedEmailHint,
      password: "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      await signInMutation.mutateAsync(value);
    },
  });

  return (
    <form
      className="flex flex-col gap-6"
      data-hydrated={isHydrated ? "true" : "false"}
      id="login-form"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Login to your account</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Enter your email below to login to your account
          </p>
        </div>
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
                <FieldLabel htmlFor="selfhost-login-email">Email</FieldLabel>
                <Input
                  id="selfhost-login-email"
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
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
                <div className="flex items-center">
                  <FieldLabel htmlFor="selfhost-login-password">Password</FieldLabel>
                  <a
                    href="/#"
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </a>
                </div>
                <Input
                  id="selfhost-login-password"
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

        <Field>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                disabled={
                  !isHydrated ||
                  !canSubmit ||
                  isSubmitting ||
                  signInMutation.isPending
                }
              >
                {isSubmitting || signInMutation.isPending ? "Signing in..." : "Login"}
              </Button>
            )}
          />
        </Field>
        {googleEnabled ? (
          <>
            <FieldSeparator>Or continue with</FieldSeparator>
            <Field>
              <Button
                variant="outline"
                type="button"
                disabled={!isHydrated || googleSignInMutation.isPending}
                onClick={() => void googleSignInMutation.mutateAsync()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  x="0px"
                  y="0px"
                  width="100"
                  height="100"
                  viewBox="0 0 48 48"
                >
                  <path
                    fill="#FFC107"
                    d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                  />
                </svg>
                {googleSignInMutation.isPending
                  ? "Continuing..."
                  : "Continue with Google"}
              </Button>
            </Field>
          </>
        ) : null}
        <Field>
          <FieldDescription className={cn("text-center", formError ? "space-y-2" : "")}>
            {formError ? <span className="block text-destructive">{formError}</span> : null}
            Don&apos;t have an account? Contact your admin at{" "}
            <a href="mailto:admin@cms0.io" className="underline underline-offset-4">
              admin@cms0.io
            </a>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
