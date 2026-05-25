import { LoginForm } from "@/components/login-form";
import { getSelfHostedGoogleProviderConfig } from "@/lib/auth/config";

type LoginPageProps = {
  searchParams: Promise<{
    email?: string;
    redirect?: string;
  }>;
};

export default async function Page({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const googleEnabled = Boolean(getSelfHostedGoogleProviderConfig());

  return (
    <LoginForm
      emailHint={params.email}
      googleEnabled={googleEnabled}
      redirect={params.redirect}
    />
  );
}
