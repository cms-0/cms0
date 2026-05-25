import { afterEach, describe, expect, it } from "vitest";

import {
  getHostedEnvironmentEndpointExamples,
  readPublicBooleanEnv,
} from "../../lib/public-env";

const originalEnv = { ...process.env };

describe("docs public env helpers", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("parses public boolean env values", () => {
    process.env.CMS0_DOCS_FLAG = "true";
    expect(readPublicBooleanEnv("CMS0_DOCS_FLAG")).toBe(true);

    process.env.CMS0_DOCS_FLAG = "0";
    expect(readPublicBooleanEnv("CMS0_DOCS_FLAG")).toBe(false);
  });

  it("rejects non-boolean public env values", () => {
    process.env.CMS0_DOCS_FLAG = "sometimes";

    expect(() => readPublicBooleanEnv("CMS0_DOCS_FLAG")).toThrow(
      "CMS0_DOCS_FLAG must be a boolean value.",
    );
  });

  it("builds hosted endpoint examples from enabled runtime modes", () => {
    process.env.CMS0_PUBLIC_APP_URL = "http://localhost:3001";
    process.env.CMS0_BASE_DOMAIN = "localhost:3001";
    process.env.CMS0_PUBLIC_ENV_PATH_RUNTIME_ENABLED = "true";
    process.env.CMS0_PUBLIC_ENV_SUBDOMAIN_RUNTIME_ENABLED = "false";

    expect(getHostedEnvironmentEndpointExamples("stage")).toEqual([
      "http://localhost:3001/api/content/stage",
    ]);
  });
});
