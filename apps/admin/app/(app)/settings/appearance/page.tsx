import { ThemePreferenceForm } from "@/components/theme-preference-form";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Appearance</h1>
        <p className="text-sm text-muted-foreground">
          Choose a local theme preference for the self-hosted admin.
        </p>
      </div>

      <ThemePreferenceForm />
    </div>
  );
}
