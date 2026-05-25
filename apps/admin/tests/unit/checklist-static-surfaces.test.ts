import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");

const resolveFromRoot = (...segments: string[]) =>
  path.join(repoRoot, ...segments);

const readText = (...segments: string[]) =>
  readFileSync(resolveFromRoot(...segments), "utf8");

const expectFile = (...segments: string[]) => {
  expect(existsSync(resolveFromRoot(...segments))).toBe(true);
};

describe("core checklist static surfaces", () => {
  it("keeps the standalone docs app and self-hosted admin app surface present", () => {
    expectFile("apps", "docs", "package.json");
    expectFile("apps", "docs", "app", "[[...mdxPath]]", "page.tsx");
    expectFile("apps", "docs", "content", "index.mdx");
    expectFile("apps", "admin", "package.json");
    expectFile("apps", "admin", "app", "page.tsx");
    expectFile("apps", "admin", "app", "(app)", "dashboard", "page.tsx");

    expect(
      readText("apps", "docs", "content", "self-hosting", "index.mdx"),
    ).toContain("Self-hosting");
  });

  it("keeps the shared package surfaces wired into the app", () => {
    const packages = [
      {
        manifestPath: ["packages", "admin-contract", "package.json"],
        name: "@cms0/admin-contract",
        smokePaths: [["packages", "admin-contract", "src", "index.ts"]],
      },
      {
        manifestPath: ["packages", "admin-client", "package.json"],
        name: "@cms0/admin-client",
        smokePaths: [["packages", "admin-client", "src", "index.ts"]],
      },
      {
        manifestPath: ["packages", "cms0", "package.json"],
        name: "@cms0/cms0",
        smokePaths: [
          ["packages", "cms0", "src", "index.ts"],
          ["packages", "cms0", "src", "cli.ts"],
          ["packages", "cms0", "bin", "cms0.js"],
        ],
      },
      {
        manifestPath: ["packages", "transactional", "package.json"],
        name: "@cms0/transactional",
        smokePaths: [
          ["packages", "transactional", "src", "index.ts"],
          ["packages", "transactional", "emails", "team-invite.tsx"],
          ["packages", "transactional", "emails", "reset-password.tsx"],
        ],
      },
      {
        manifestPath: ["packages", "typescript-config", "package.json"],
        name: "@cms0/typescript-config",
        smokePaths: [
          ["packages", "typescript-config", "base.json"],
          ["packages", "typescript-config", "nextjs.json"],
          ["packages", "typescript-config", "react-library.json"],
        ],
      },
    ] as const;

    for (const packageSurface of packages) {
      const manifest = JSON.parse(readText(...packageSurface.manifestPath)) as {
        name?: string;
      };

      expect(manifest.name).toBe(packageSurface.name);

      for (const smokePath of packageSurface.smokePaths) {
        expectFile(...smokePath);
      }
    }

    expect(readText("packages", "cms0", "src", "cli.ts")).toContain(
      "runFromCli",
    );
    expect(readText("packages", "transactional", "src", "index.ts")).toContain(
      "sendTeamInvite",
    );
  });

  it("keeps the checklist page and route modules present", () => {
    const routeFiles = [
      ["apps", "admin", "app", "page.tsx"],
      ["apps", "admin", "app", "(auth)", "login", "page.tsx"],
      ["apps", "admin", "app", "(auth)", "signup", "page.tsx"],
      ["apps", "admin", "app", "(app)", "dashboard", "page.tsx"],
      ["apps", "admin", "app", "(app)", "content", "[...path]", "page.tsx"],
      ["apps", "admin", "app", "(app)", "models", "page.tsx"],
      ["apps", "admin", "app", "(app)", "models", "[modelName]", "page.tsx"],
      ["apps", "admin", "app", "(app)", "documentation", "page.tsx"],
      ["apps", "admin", "app", "(app)", "documentation", "api", "page.tsx"],
      ["apps", "admin", "app", "(app)", "settings", "page.tsx"],
      ["apps", "admin", "app", "(app)", "settings", "api-keys", "page.tsx"],
      [
        "apps",
        "admin",
        "app",
        "(app)",
        "settings",
        "api-keys",
        "create",
        "page.tsx",
      ],
      [
        "apps",
        "admin",
        "app",
        "(app)",
        "settings",
        "api-keys",
        "[keyId]",
        "page.tsx",
      ],
      ["apps", "admin", "app", "(app)", "settings", "appearance", "page.tsx"],
      ["apps", "admin", "app", "(app)", "settings", "backups", "page.tsx"],
      ["apps", "admin", "app", "(app)", "settings", "team", "page.tsx"],
      [
        "apps",
        "admin",
        "app",
        "(app)",
        "settings",
        "team",
        "accept-invitation",
        "[invitationId]",
        "page.tsx",
      ],
      ["apps", "admin", "app", "(app)", "settings", "triggers", "page.tsx"],
      ["apps", "admin", "app", "(app)", "settings", "usage", "page.tsx"],
      ["apps", "admin", "app", "api", "auth", "[...all]", "route.ts"],
      ["apps", "admin", "app", "api", "content", "[[...slug]]", "route.ts"],
    ] as const;

    for (const filePath of routeFiles) {
      expectFile(...filePath);
    }

    expect(
      readText("apps", "admin", "app", "(app)", "documentation", "page.tsx"),
    ).toContain('redirect("/documentation/api")');
    expect(
      readText("apps", "admin", "app", "(app)", "settings", "page.tsx"),
    ).toContain(">Settings<");
    expect(
      readText(
        "apps",
        "admin",
        "app",
        "(app)",
        "settings",
        "appearance",
        "page.tsx",
      ),
    ).toContain(">Appearance<");
    expect(
      readText(
        "apps",
        "admin",
        "app",
        "(app)",
        "settings",
        "triggers",
        "page.tsx",
      ),
    ).toContain(">Triggers<");
    expect(
      readText(
        "apps",
        "admin",
        "app",
        "(app)",
        "settings",
        "usage",
        "page.tsx",
      ),
    ).toContain(">Runtime usage<");
  });
});
