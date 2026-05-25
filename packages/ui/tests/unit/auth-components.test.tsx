import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { AuthCard } from "../../src/components/auth-card";
import { AuthMethodDivider } from "../../src/components/auth-method-divider";
import { cn } from "../../src/lib/utils";

describe("@cms0/ui shared auth components", () => {
  it("merges class names through cn", () => {
    expect(cn("px-4", false && "hidden", "py-2")).toBe("px-4 py-2");
  });

  it("renders the shared auth card and divider", () => {
    const markup = renderToStaticMarkup(
      <AuthCard title="Sign in" description="Access the runtime.">
        <AuthMethodDivider />
        <div>Body</div>
      </AuthCard>,
    );

    expect(markup).toContain("Sign in");
    expect(markup).toContain("Access the runtime.");
    expect(markup).toContain("Body");
    expect(markup).toContain(">or<");
  });
});
