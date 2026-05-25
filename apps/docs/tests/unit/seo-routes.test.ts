import { describe, expect, it } from "vitest";

import { getDocsRoutes } from "../../lib/docs-routes";

describe("docs SEO routes", () => {
  it("derives public docs routes from the content tree", () => {
    const routes = getDocsRoutes();

    expect(routes).toContain("/");
    expect(routes).toContain("/getting-started");
    expect(routes).toContain("/self-hosting");
    expect(routes).toContain("/self-hosting/deployment");
    expect(routes).toContain("/app-integration/accessors");
    expect(routes).toContain("/hosted-workspace");
    expect(routes.some((route) => route.includes("_meta"))).toBe(false);
  });
});
