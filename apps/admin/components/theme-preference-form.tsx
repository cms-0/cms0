"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  RadioGroup,
  RadioGroupItem,
} from "@cms0/ui";

type ThemeMode = "light" | "dark" | "system";

const themeOptions: Array<{
  description: string;
  label: string;
  value: ThemeMode;
}> = [
  {
    description: "Use the light cms0 admin palette.",
    label: "Light",
    value: "light",
  },
  {
    description: "Use the dark cms0 admin palette.",
    label: "Dark",
    value: "dark",
  },
  {
    description: "Follow this device's operating-system preference.",
    label: "System",
    value: "system",
  },
];

export function ThemePreferenceForm() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const selectedTheme = (theme ?? "system") as ThemeMode;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Theme</Badge>
          <Badge variant="outline">
            Active: {mounted ? (resolvedTheme ?? selectedTheme) : "loading"}
          </Badge>
        </div>
        <CardTitle>Theme preference</CardTitle>
        <CardDescription>
          Choose how the self-hosted admin should render locally. The preference is
          stored in the browser so every operator can choose their own view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Mode</FieldLabel>
            <RadioGroup
              value={mounted ? selectedTheme : "system"}
              onValueChange={(value) => setTheme(value)}
              className="grid gap-3 md:grid-cols-3"
            >
              {themeOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer flex-col gap-3 rounded-lg border bg-background/70 p-4"
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value={option.value} />
                    <span className="font-medium">{option.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {option.description}
                  </span>
                </label>
              ))}
            </RadioGroup>
            <FieldDescription>
              System mode reacts to OS-level light/dark preference changes.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" onClick={() => setTheme("system")}>
            Reset to system
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
