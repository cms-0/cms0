import { describe, expect, it } from "vitest";

import meta from "../../content/_meta.js";

describe("docs navigation metadata", () => {
  it("keeps the primary docs sections registered", () => {
    expect(meta).toMatchObject({
      "app-integration": "App integration",
      "hosted-workspace": "Hosted workspace",
      license: "License",
      "self-hosting": "Self-hosting",
      reference: "Reference",
    });
  });
});
