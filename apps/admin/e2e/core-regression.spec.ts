import http from "node:http";

import {
  test,
  expect,
  type Browser,
  type Dialog,
  type Page,
  type Response,
} from "@playwright/test";
import {
  getAdminContext as getCms0Context,
  getAdminHealth as getCms0Health,
  getAdminLatestSnapshot as getCms0LatestSnapshot,
  getAdminLatestTypescript as getCms0LatestTypescript,
} from "@cms0/admin-client";
import type { RuntimeBackupRecord } from "@cms0/admin-contract";

import {
  closeCoreE2EDb,
  getLatestInvitationId,
  getOrganizationMembershipCount,
  getTeamMembershipCount,
  userExists,
} from "./support/db";
import {
  articleFixtures,
  coreDescriptorVersion,
  coreE2EConfig,
  coreUsers,
  type ExampleArticleFixture,
  siteFixtures,
} from "./support/fixtures";
import {
  createArticleEntry,
  deleteArticleEntry,
  expectCollectionTitle,
  fetchRuntimeJsonWithApiKey,
  fetchSessionJson,
  publishExampleDescriptor,
  replaceSiteContent,
  signInSelfHostedUser,
  signOutSelfHostedUser,
  signUpSelfHostedUser,
  updateArticleEntry,
} from "./support/helpers";

type CollectionResponse = {
  ok: true;
  resource: {
    apiPath: string;
    kind: string;
  };
  value: Array<Record<string, unknown>>;
};

type SingletonResponse = {
  ok: true;
  resource: {
    apiPath: string;
    kind: string;
  };
  value: Record<string, unknown>;
};

type HealthResponse = {
  environmentKey: string;
  ok: true;
  server: "cms0-admin-server";
};

type WebhookCapture = {
  body: string;
  method: string;
  url: string;
};

type AdminContentNetworkEntry = {
  method: string;
  pathname: string;
  search: string;
};

type AdminEditorTarget = {
  expectedGraphPath: string;
  kind: "array" | "object";
  path: string;
  route: string;
};

const E2E_NAV_TIMEOUT = 60_000;

const expectPageToLoad = async (
  page: Page,
  path: string,
  urlPattern: RegExp,
) => {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(urlPattern, { timeout: E2E_NAV_TIMEOUT });
  await expect(page.locator("main").first()).toBeVisible();
};

const waitForEditorNetworkToSettle = async (page: Page) => {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForLoadState("networkidle", { timeout: 500 })
    .catch(() => {});
};

const createAdminContentNetworkRecorder = (page: Page) => {
  const entries: AdminContentNetworkEntry[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith(coreE2EConfig.runtimeBasePath)) {
      return;
    }

    entries.push({
      method: request.method(),
      pathname: url.pathname,
      search: url.search,
    });
  });

  return {
    clear() {
      entries.length = 0;
    },
    entries() {
      return [...entries];
    },
  };
};

const contentControlPath = (entry: AdminContentNetworkEntry) =>
  entry.pathname.slice(coreE2EConfig.runtimeBasePath.length);

const graphReadPath = (entry: AdminContentNetworkEntry) => {
  const marker = "/_graph/";
  const pathValue = contentControlPath(entry);
  if (entry.method !== "GET" || !pathValue.startsWith(marker)) {
    return null;
  }

  return pathValue
    .slice(marker.length)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
};

const isLegacyContentRead = (entry: AdminContentNetworkEntry) => {
  if (entry.method !== "GET") {
    return false;
  }

  const pathValue = contentControlPath(entry);
  if (pathValue.startsWith("/_graph/")) {
    return false;
  }
  if (pathValue.startsWith("/schema/")) {
    return false;
  }
  if (pathValue === "/health" || pathValue === "/context") {
    return false;
  }
  if (pathValue.startsWith("/manualTriggers")) {
    return false;
  }

  return true;
};

const isLegacyContentWrite = (entry: AdminContentNetworkEntry) => {
  if (!["DELETE", "PATCH", "POST", "PUT"].includes(entry.method)) {
    return false;
  }

  return !contentControlPath(entry).startsWith("/_graph/");
};

const isGraphMutation = (
  entry: AdminContentNetworkEntry,
  graphPath: string,
) => {
  const pathValue = contentControlPath(entry)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");

  return entry.method === "POST" && pathValue === `/_graph/${graphPath}/_mutate`;
};

const formatContentEntries = (entries: AdminContentNetworkEntry[]) =>
  entries
    .map((entry) => `${entry.method} ${contentControlPath(entry)}${entry.search}`)
    .join("\n");

const responsePathname = (response: Response) =>
  new URL(response.url()).pathname;

const assertAdminEditorInitialRender = async ({
  page,
  recorder,
  target,
}: {
  page: Page;
  recorder: ReturnType<typeof createAdminContentNetworkRecorder>;
  target: AdminEditorTarget;
}) => {
  await page.goto("about:blank");
  await waitForEditorNetworkToSettle(page);
  recorder.clear();

  await page.goto(target.route, { waitUntil: "domcontentloaded" });
  await waitForEditorNetworkToSettle(page);

  const entries = recorder.entries();
  const graphReads = entries.map(graphReadPath).filter(Boolean);
  const matchingGraphReads = graphReads.filter(
    (pathValue) => pathValue === target.expectedGraphPath,
  );
  const unexpectedGraphReads = graphReads.filter(
    (pathValue) => pathValue !== target.expectedGraphPath,
  );
  const legacyReads = entries.filter(isLegacyContentRead);

  await expect(page.locator("main").first()).toBeVisible();
  if (target.kind === "array") {
    await expect(page.getByTestId("collection-table").first()).toBeVisible();
  } else {
    await expect(
      page
        .locator(
          `[data-testid="object-form"][data-api-path="${target.expectedGraphPath}"]`,
        )
        .first(),
    ).toBeVisible();
  }

  expect(
    unexpectedGraphReads,
    `${target.path} made unexpected graph reads:\n${formatContentEntries(entries)}`,
  ).toEqual([]);
  expect(
    matchingGraphReads.length,
    `${target.path} should make at most one browser graph read for ${target.expectedGraphPath}; saw:\n${formatContentEntries(entries)}`,
  ).toBeLessThanOrEqual(1);
  expect(
    legacyReads,
    `${target.path} made legacy content reads:\n${formatContentEntries(legacyReads)}`,
  ).toEqual([]);
};

const expectGraphMutationOnly = (
  entries: AdminContentNetworkEntry[],
  graphPath: string,
  actionLabel: string,
) => {
  expect(
    entries.some((entry) => isGraphMutation(entry, graphPath)),
    `${actionLabel} did not use _graph/${graphPath}/_mutate. Requests:\n${formatContentEntries(entries)}`,
  ).toBe(true);
  expect(
    entries.filter(isLegacyContentWrite),
    `${actionLabel} used legacy content writes:\n${formatContentEntries(entries)}`,
  ).toEqual([]);
};

const buildArticleFixture = (
  token: string,
  overrides: Partial<ExampleArticleFixture> = {},
): ExampleArticleFixture => ({
  excerpt: `Admin content editor E2E article ${token}.`,
  featured: true,
  publishedAt: "2026-05-15",
  slug: `admin-content-editor-${token}`,
  tag: "Editor",
  title: `Admin content editor ${token}`,
  ...overrides,
});

const ensureOwnerSessionAndDescriptor = async (page: Page, version: string) => {
  if (!(await userExists(coreUsers.owner.email))) {
    throw new Error("Expected the E2E bootstrap owner account to exist.");
  }

  await signInSelfHostedUser(page, coreUsers.owner);
  await expect(page).toHaveURL(/\/dashboard$/, {
    timeout: E2E_NAV_TIMEOUT,
  });

  const latest = await fetchSessionJson<{
    ok: true;
    snapshot: { version: string } | null;
  }>(page, `${coreE2EConfig.runtimeBasePath}/schema/latestSnapshot`);
  if (latest.status === 200 && latest.body?.snapshot?.version === version) {
    return;
  }

  await publishExampleDescriptor(page, version);
};

const startWebhookServer = async () => {
  const requests: WebhookCapture[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      requests.push({
        body: Buffer.concat(chunks).toString("utf8"),
        method: request.method ?? "",
        url: request.url ?? "",
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind local webhook capture server.");
  }

  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    requests,
    url: `http://127.0.0.1:${address.port}/hook`,
  };
};

test.describe.serial("core regression e2e", () => {
  test.afterAll(async () => {
    await closeCoreE2EDb();
  });

  test("covers auth bootstrap, content flows, API keys, triggers, and backups", async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(8 * 60 * 1000);

    let issuedApiKey = "";
    let createdBackupId = "";

    await test.step("redirects unauthenticated visits into login", async () => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/login$/);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);
      await expect(page.locator("#selfhost-login-email")).toBeVisible();
      await expect(page.locator("#selfhost-login-password")).toBeVisible();
    });

    await test.step("uses the bootstrapped first operator account", async () => {
      await signInSelfHostedUser(page, coreUsers.owner);
      await expect(page).toHaveURL(/\/dashboard$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
      await expect(
        page.getByRole("heading", { name: "Admin Dashboard" }),
      ).toBeVisible();

      await page.goto("/login");
      await expect(page).toHaveURL(/\/dashboard$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
    });

    await test.step("logs out and preserves safe redirect behavior", async () => {
      const authCookies = (await page.context().cookies()).filter((cookie) =>
        cookie.name.includes("better-auth"),
      );
      expect(authCookies.length).toBeGreaterThan(0);

      await signOutSelfHostedUser(page);
      await expect(page).toHaveURL(/\/login$/);

      await page.context().addCookies(
        authCookies.map((cookie) => ({
          ...cookie,
          expires: Math.floor(Date.now() / 1000) + 60 * 60,
          value: "stale-session-token",
        })),
      );
      await page.goto("/login");
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator("#selfhost-login-email")).toBeVisible();

      await signInSelfHostedUser(
        page,
        coreUsers.owner,
        "/login?redirect=https://malicious.example/steal",
      );
      await expect(page).toHaveURL(/\/dashboard$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
    });

    await test.step("publishes the example descriptor and exposes model routes", async () => {
      await publishExampleDescriptor(page, coreDescriptorVersion);
      await page.goto("/models");
      await expect(page.getByRole("link", { name: "article" })).toBeVisible();
      await page.getByRole("link", { name: "article" }).click();
      await expect(page).toHaveURL(/\/models\/article$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
      await expectCollectionTitle(page, "article");
    });

    await test.step("loads the documentation surfaces", async () => {
      const response = await page.goto("/documentation");
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/documentation\/api$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
      await expect(
        page.locator("iframe[title='Admin API reference']"),
      ).toBeVisible();

      const getStartedLink = page.getByRole("link", { name: "Get Started" });
      await expect(getStartedLink).toHaveAttribute(
        "href",
        "https://docs.cms0.test/getting-started/",
      );
      await expect(getStartedLink).toHaveAttribute("target", "_blank");
      await expect(getStartedLink).toHaveAttribute("rel", "noreferrer");

      const changelogLink = page.getByRole("link", { name: "Changelog" });
      await expect(changelogLink).toHaveAttribute(
        "href",
        "https://docs.cms0.test/changelog/",
      );
      await expect(changelogLink).toHaveAttribute("target", "_blank");
      await expect(changelogLink).toHaveAttribute("rel", "noreferrer");
    });

    await test.step("updates singleton root content through the descriptor-path editor", async () => {
      await page.goto("/content/site");
      await expect(page).toHaveURL(/\/content\/site$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
      await expect(page.locator("main").first()).toBeVisible();
      await replaceSiteContent(page, siteFixtures.updated);

      await expect
        .poll(async () => {
          const siteContent = await fetchSessionJson<SingletonResponse>(
            page,
            `${coreE2EConfig.runtimeBasePath}/content/site`,
          );

          const value = siteContent.body?.value;
          if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            "stats" in value &&
            value.stats &&
            typeof value.stats === "object" &&
            !Array.isArray(value.stats) &&
            "data" in value.stats
          ) {
            return {
              ...value,
              stats: value.stats.data,
            };
          }

          return value;
        })
        .toMatchObject({
          announcement: {
            label: siteFixtures.updated.announcementLabel,
            message: siteFixtures.updated.announcementMessage,
          },
          hero: {
            eyebrow: siteFixtures.updated.heroEyebrow,
            primaryCtaHref: siteFixtures.updated.primaryCtaHref,
            primaryCtaLabel: siteFixtures.updated.primaryCtaLabel,
            secondaryCtaHref: siteFixtures.updated.secondaryCtaHref,
            secondaryCtaLabel: siteFixtures.updated.secondaryCtaLabel,
            subtitle: siteFixtures.updated.heroSubtitle,
            title: siteFixtures.updated.heroTitle,
          },
          stats: siteFixtures.updated.stats,
        });
    });

    await test.step("creates and updates content through the model route", async () => {
      await page.goto("/models/article");
      await expectCollectionTitle(page, "article");
      await createArticleEntry(page, articleFixtures.created);

      const createdCollection = await fetchSessionJson<CollectionResponse>(
        page,
        `${coreE2EConfig.runtimeBasePath}/content/models/article`,
      );
      expect(createdCollection.status).toBe(200);
      expect(
        createdCollection.body?.value.some(
          (entry) => entry.slug === articleFixtures.created.slug,
        ),
      ).toBe(true);

      await updateArticleEntry(
        page,
        articleFixtures.created.title,
        articleFixtures.updated,
      );

      const updatedCollection = await fetchSessionJson<CollectionResponse>(
        page,
        `${coreE2EConfig.runtimeBasePath}/content/models/article`,
      );
      const updatedEntry = updatedCollection.body?.value.find(
        (entry) => entry.slug === articleFixtures.updated.slug,
      );
      expect(updatedCollection.status).toBe(200);
      expect(updatedEntry?.title).toBe(articleFixtures.updated.title);
      expect(updatedEntry?.tag).toBe(articleFixtures.updated.tag);
    });

    await test.step("creates, updates, and deletes content through the descriptor-path route", async () => {
      await page.goto("/content/models/article");
      await expect(page).toHaveURL(/\/content\/models\/article$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
      await expectCollectionTitle(page, "article");

      await createArticleEntry(page, articleFixtures.descriptorCreated);
      await updateArticleEntry(
        page,
        articleFixtures.descriptorCreated.title,
        articleFixtures.descriptorUpdated,
      );

      await page
        .getByTestId("collection-search")
        .fill(articleFixtures.descriptorUpdated.title);
      await expect(
        page.getByRole("row").filter({
          hasText: articleFixtures.descriptorUpdated.title,
        }),
      ).toBeVisible();

      await deleteArticleEntry(page, articleFixtures.descriptorUpdated.title);

      await expect
        .poll(async () => {
          const collection = await fetchSessionJson<CollectionResponse>(
            page,
            `${coreE2EConfig.runtimeBasePath}/content/models/article`,
          );

          return {
            hasDescriptorPathArticle:
              collection.body?.value.some(
                (entry) =>
                  entry.slug === articleFixtures.descriptorUpdated.slug,
              ) ?? false,
            hasPrimaryArticle:
              collection.body?.value.some(
                (entry) => entry.slug === articleFixtures.updated.slug,
              ) ?? false,
          };
        })
        .toEqual({
          hasDescriptorPathArticle: false,
          hasPrimaryArticle: true,
        });
    });

    await test.step("issues, updates, uses, and revokes a self-hosted API key", async () => {
      await page.goto("/settings/api-keys/create");
      await page.locator("#api-key-name").fill("Core Regression E2E Key");
      await page.getByRole("button", { name: "Create API key" }).click();
      await expect(
        page.getByTestId("self-hosted-api-key-secret"),
      ).toBeVisible();

      issuedApiKey = (
        (await page.getByTestId("self-hosted-api-key-secret").textContent()) ??
        ""
      ).trim();
      expect(issuedApiKey).toBeTruthy();

      await page.getByRole("link", { name: "Open key details" }).click();
      await expect(page).toHaveURL(/\/settings\/api-keys\/.+$/, {
        timeout: E2E_NAV_TIMEOUT,
      });
      await expect(page.getByTestId("api-key-lifecycle-panel")).toHaveAttribute(
        "data-ready",
        "true",
      );

      await page
        .locator("#api-key-edit-name")
        .fill("Core Regression E2E Key Updated");
      const expirationToggle = page.getByRole("checkbox", {
        name: "Set expiration",
      });
      await expirationToggle.click();
      await expect(expirationToggle).toBeChecked();
      const expiryInput = page.locator("#api-key-edit-expiry");
      await expect(expiryInput).toBeVisible();
      await expiryInput.fill("14");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("API key updated.")).toBeVisible();

      const runtimeClientInput = {
        adminBaseUrl: coreE2EConfig.baseUrl,
        apiKey: issuedApiKey,
        routePrefix: coreE2EConfig.runtimeBasePath,
      };
      const packageHealth = await getCms0Health(runtimeClientInput);
      const packageContext = await getCms0Context(runtimeClientInput);
      const packageSnapshot = await getCms0LatestSnapshot(runtimeClientInput);
      const packageTypescript =
        await getCms0LatestTypescript(runtimeClientInput);

      expect(packageHealth.ok).toBe(true);
      expect(packageContext.snapshot?.version).toBe(coreDescriptorVersion);
      expect(packageSnapshot.snapshot?.version).toBe(coreDescriptorVersion);
      expect(packageTypescript.snapshot?.version).toBe(coreDescriptorVersion);
      expect(packageTypescript.code).toContain(
        `export const descriptorVersion = "${coreDescriptorVersion}"`,
      );
      expect(packageTypescript.code).toContain("export const descriptor =");

      const health = await fetchRuntimeJsonWithApiKey<HealthResponse>(
        `${coreE2EConfig.runtimeBasePath}/health`,
        issuedApiKey,
      );
      expect(health.status).toBe(200);
      expect(health.body?.ok).toBe(true);
      expect(health.body?.server).toBe("cms0-admin-server");

      page.once("dialog", (dialog) => {
        void dialog.accept();
      });
      const revokeResponse = page.waitForResponse(
        (response: Response) =>
          response.request().method() === "DELETE" &&
          response.url().includes(`${coreE2EConfig.runtimeBasePath}/api-keys/`),
      );
      await page.getByRole("button", { name: "Revoke key" }).click();
      await revokeResponse;

      const revokedHealth = await fetchRuntimeJsonWithApiKey<{
        error: string;
      }>(`${coreE2EConfig.runtimeBasePath}/health`, issuedApiKey);
      expect(revokedHealth.status).toBe(401);
      expect(revokedHealth.body?.error).toBe("Unauthorized");
    });

    await test.step("loads the settings surfaces", async () => {
      await expectPageToLoad(page, "/settings", /\/settings$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Settings" }),
      ).toBeVisible();

      await expectPageToLoad(
        page,
        "/settings/api-keys",
        /\/settings\/api-keys$/,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "API keys" }),
      ).toBeVisible();

      await expectPageToLoad(
        page,
        "/settings/appearance",
        /\/settings\/appearance$/,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Appearance" }),
      ).toBeVisible();

      await expectPageToLoad(
        page,
        "/settings/triggers",
        /\/settings\/triggers$/,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Triggers" }),
      ).toBeVisible();

      await expectPageToLoad(page, "/settings/usage", /\/settings\/usage$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Runtime usage" }),
      ).toBeVisible();
    });

    await test.step("creates, runs, updates, and deletes manual triggers through the live UI", async () => {
      const webhook = await startWebhookServer();
      const triggerName = `Self-host trigger ${Date.now()}`;
      const triggerLabel = `Run self-host trigger ${Date.now()}`;
      const updatedTriggerLabel = `${triggerLabel} updated`;
      const initialSuccessMessage = "Self-host trigger completed.";
      const updatedSuccessMessage = "Self-host trigger completed after update.";

      try {
        await page.goto("/settings/triggers");
        await page.getByRole("button", { name: "Create trigger" }).click();

        const dialog = page.getByRole("dialog").last();
        await expect(
          dialog.getByRole("heading", { name: "Create trigger" }),
        ).toBeVisible();
        await dialog.locator("#trigger-name").fill(triggerName);
        await dialog.locator("#trigger-button-label").fill(triggerLabel);
        await dialog
          .locator("#trigger-success-message")
          .fill(initialSuccessMessage);
        await dialog.locator("#trigger-url").fill(webhook.url);
        await dialog.locator("#trigger-body-template").fill(
          JSON.stringify({
            pathname: "{{pathname}}",
            resource: "{{resourceName}}",
          }),
        );
        const createTriggerButton = dialog.getByRole("button", {
          name: "Create trigger",
        });
        const createTriggerResponse = page.waitForResponse(
          (response: Response) =>
            response.request().method() === "POST" &&
            responsePathname(response) ===
              `${coreE2EConfig.runtimeBasePath}/triggers`,
        );
        await createTriggerButton.evaluate((button: Element) =>
          (button as HTMLButtonElement).click(),
        );
        expect((await createTriggerResponse).ok()).toBe(true);

        const triggerRow = page
          .getByRole("row")
          .filter({ hasText: triggerName });
        await expect(triggerRow).toBeVisible({ timeout: 30_000 });

        await page.goto("/models/article");
        await page.getByTestId("floating-trigger-menu").click();
        const triggerMenuItem = page.getByRole("menuitem", {
          name: triggerLabel,
        });
        await expect(triggerMenuItem).toBeVisible();
        await triggerMenuItem.click();
        await expect(page.getByText(initialSuccessMessage)).toBeVisible();
        await expect.poll(() => webhook.requests.length).toBe(1);
        expect(webhook.requests[0]?.method).toBe("POST");
        expect(webhook.requests[0]?.url).toContain("/hook");
        expect(webhook.requests[0]?.body).toContain('"resource":"article"');
        expect(webhook.requests[0]?.body).toContain("/models/article");

        await page.goto("/settings/triggers");
        await page
          .getByRole("row")
          .filter({ hasText: triggerName })
          .getByRole("button", { name: "Edit" })
          .click();

        const editDialog = page.getByRole("dialog").last();
        await expect(
          editDialog.getByRole("heading", { name: "Edit trigger" }),
        ).toBeVisible();
        await editDialog
          .locator("#trigger-button-label")
          .fill(updatedTriggerLabel);
        await editDialog
          .locator("#trigger-success-message")
          .fill(updatedSuccessMessage);
        const saveTriggerButton = editDialog.getByRole("button", {
          name: "Save changes",
        });
        const updateTriggerResponse = page.waitForResponse(
          (response: Response) =>
            response.request().method() === "PATCH" &&
            responsePathname(response).startsWith(
              `${coreE2EConfig.runtimeBasePath}/triggers/`,
            ),
        );
        await saveTriggerButton.evaluate((button: Element) =>
          (button as HTMLButtonElement).click(),
        );
        expect((await updateTriggerResponse).ok()).toBe(true);

        await page.goto("/models/article");
        await page.getByTestId("floating-trigger-menu").click();
        const updatedTriggerMenuItem = page.getByRole("menuitem", {
          name: updatedTriggerLabel,
        });
        await expect(updatedTriggerMenuItem).toBeVisible();
        await updatedTriggerMenuItem.click();
        await expect(page.getByText(updatedSuccessMessage)).toBeVisible();
        await expect.poll(() => webhook.requests.length).toBe(2);

        await page.goto("/settings/triggers");
        page.once("dialog", (dialog: Dialog) => {
          void dialog.accept();
        });
        const deleteTriggerResponse = page.waitForResponse(
          (response: Response) =>
            response.request().method() === "DELETE" &&
            responsePathname(response).startsWith(
              `${coreE2EConfig.runtimeBasePath}/triggers/`,
            ),
        );
        await page
          .getByRole("row")
          .filter({ hasText: triggerName })
          .getByRole("button", { name: "Delete" })
          .click();
        expect((await deleteTriggerResponse).ok()).toBe(true);
        await expect(
          page.getByRole("row").filter({ hasText: triggerName }),
        ).toHaveCount(0, { timeout: 30_000 });
      } finally {
        await webhook.close();
      }
    });

    await test.step("creates a backup, mutates content, restores the backup, deletes it, and confirms rollback", async () => {
      await page.goto("/settings/backups");
      await page.getByRole("button", { name: "Backup now" }).click();
      const backupNotice = page.getByText(/^Created backup .+\.$/);
      await expect(backupNotice).toBeVisible();
      const backupMessage = (await backupNotice.textContent()) ?? "";
      const backupIdMatch = backupMessage.match(/^Created backup (.+)\.$/);
      createdBackupId = backupIdMatch?.[1] ?? "";
      expect(createdBackupId).toBeTruthy();
      await expect
        .poll(async () => {
          const backups = await fetchSessionJson<RuntimeBackupRecord[]>(
            page,
            `${coreE2EConfig.runtimeBasePath}/backups`,
          );

          return backups.body?.[0]?.id ?? null;
        })
        .toBe(createdBackupId);

      await page.goto("/models/article");
      await updateArticleEntry(
        page,
        articleFixtures.updated.title,
        articleFixtures.mutated,
      );

      const mutatedCollection = await fetchSessionJson<CollectionResponse>(
        page,
        `${coreE2EConfig.runtimeBasePath}/content/models/article`,
      );
      expect(
        mutatedCollection.body?.value.some(
          (entry) => entry.slug === articleFixtures.mutated.slug,
        ),
      ).toBe(true);

      await page.goto("/settings/backups");
      const restoreResponse = page.waitForResponse(
        (response: Response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .includes(
              `${coreE2EConfig.runtimeBasePath}/backups/${createdBackupId}/restore`,
            ),
      );
      page.once("dialog", (dialog: Dialog) => {
        void dialog.accept();
      });
      const restoreBackupRow = page.locator("table tbody tr").first();
      await expect(restoreBackupRow).toBeVisible();
      await restoreBackupRow.getByRole("button", { name: "Rollback" }).click();
      await restoreResponse;
      await expect
        .poll(async () => {
          const collection = await fetchSessionJson<CollectionResponse>(
            page,
            `${coreE2EConfig.runtimeBasePath}/content/models/article`,
          );
          const restoredEntry = collection.body?.value.find(
            (entry) => entry.slug === articleFixtures.updated.slug,
          );
          return {
            hasMutated:
              collection.body?.value.some(
                (entry) => entry.slug === articleFixtures.mutated.slug,
              ) ?? false,
            restoredTitle: restoredEntry?.title ?? null,
            status: collection.status,
          };
        })
        .toEqual({
          hasMutated: false,
          restoredTitle: articleFixtures.updated.title,
          status: 200,
        });

      await page.goto("/settings/backups");
      await page.getByRole("button", { name: "Backup now" }).click();
      const deleteBackupNotice = page.getByText(/^Created backup .+\.$/);
      await expect(deleteBackupNotice).toBeVisible();
      const deleteBackupMessage =
        (await deleteBackupNotice.textContent()) ?? "";
      const deleteBackupIdMatch = deleteBackupMessage.match(
        /^Created backup (.+)\.$/,
      );
      const deleteBackupId = deleteBackupIdMatch?.[1] ?? "";
      expect(deleteBackupId).toBeTruthy();
      await expect
        .poll(async () => {
          const backups = await fetchSessionJson<RuntimeBackupRecord[]>(
            page,
            `${coreE2EConfig.runtimeBasePath}/backups`,
          );

          return backups.body?.[0]?.id ?? null;
        })
        .toBe(deleteBackupId);

      const deleteResponse = page.waitForResponse(
        (response: Response) =>
          response.request().method() === "DELETE" &&
          response
            .url()
            .includes(
              `${coreE2EConfig.runtimeBasePath}/backups/${deleteBackupId}`,
            ),
      );
      page.once("dialog", (dialog: Dialog) => {
        void dialog.accept();
      });
      const deleteBackupRow = page.locator("table tbody tr").first();
      await expect(deleteBackupRow).toBeVisible();
      await deleteBackupRow.getByRole("button", { name: "Delete" }).click();
      await deleteResponse;
      await expect(page.getByText("Backup deleted.")).toBeVisible();
      await expect
        .poll(async () => {
          const backups = await fetchSessionJson<RuntimeBackupRecord[]>(
            page,
            `${coreE2EConfig.runtimeBasePath}/backups`,
          );

          return (
            backups.body?.some((backup) => backup.id === deleteBackupId) ??
            false
          );
        })
        .toBe(false);
    });
  });

  test("covers the admin content editor graph contract", async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(4 * 60 * 1000);

    await ensureOwnerSessionAndDescriptor(page, coreDescriptorVersion);

    const recorder = createAdminContentNetworkRecorder(page);
    const editorTargets: AdminEditorTarget[] = [
      {
        expectedGraphPath: "site",
        kind: "object",
        path: "site",
        route: "/content/site",
      },
      {
        expectedGraphPath: "site/announcement",
        kind: "object",
        path: "site/announcement",
        route: "/content/site/announcement",
      },
      {
        expectedGraphPath: "site/hero",
        kind: "object",
        path: "site/hero",
        route: "/content/site/hero",
      },
      {
        expectedGraphPath: "site",
        kind: "array",
        path: "site/stats",
        route: "/content/site/stats",
      },
      {
        expectedGraphPath: "models/article",
        kind: "array",
        path: "models/article",
        route: "/models/article",
      },
      {
        expectedGraphPath: "models/article",
        kind: "array",
        path: "content/models/article",
        route: "/content/models/article",
      },
    ];

    await test.step("renders editor routes without legacy browser content reads", async () => {
      for (const target of editorTargets) {
        await assertAdminEditorInitialRender({ page, recorder, target });
      }
    });

    await test.step("uses graph mutations for model create, update, and delete", async () => {
      const token = Date.now().toString(36);
      const createdArticle = buildArticleFixture(`${token}-create`);
      const updatedArticle = buildArticleFixture(`${token}-update`, {
        excerpt: `Admin content editor E2E article ${token} updated.`,
        featured: false,
        tag: "Editor updated",
      });

      await page.goto("/models/article", { waitUntil: "domcontentloaded" });
      await expectCollectionTitle(page, "article");
      await waitForEditorNetworkToSettle(page);

      recorder.clear();
      await createArticleEntry(page, createdArticle);
      expectGraphMutationOnly(
        recorder.entries(),
        "models/article",
        "article create",
      );

      recorder.clear();
      await updateArticleEntry(page, createdArticle.title, updatedArticle);
      expectGraphMutationOnly(
        recorder.entries(),
        "models/article",
        "article update",
      );

      recorder.clear();
      await deleteArticleEntry(page, updatedArticle.title);
      await waitForEditorNetworkToSettle(page);
      expectGraphMutationOnly(
        recorder.entries(),
        "models/article",
        "article delete",
      );
    });

    await test.step("persists inline nested-array reorder through graph mutation", async () => {
      const token = Date.now().toString(36);
      const firstLabel = `Admin editor first ${token}`;
      const secondLabel = `Admin editor second ${token}`;
      const orderedMatchingLabels = async () => {
        const texts = await page
          .locator(
            '[data-testid="object-form"][data-api-path="site"] [data-testid="object-form-field"][data-field-name="stats"] [data-testid="nested-array-table"] tbody tr[data-entry-id]',
          )
          .allInnerTexts();

        return texts
          .flatMap((text) =>
            [firstLabel, secondLabel].filter((label) => text.includes(label)),
          )
          .join("|");
      };

      await page.goto("/content/site", { waitUntil: "domcontentloaded" });
      await waitForEditorNetworkToSettle(page);
      await replaceSiteContent(page, {
        ...siteFixtures.updated,
        stats: [
          {
            label: firstLabel,
            value: "first",
          },
          {
            label: secondLabel,
            value: "second",
          },
        ],
      });

      const statsField = page
        .locator('[data-testid="object-form"][data-api-path="site"]')
        .locator('[data-testid="object-form-field"][data-field-name="stats"]');
      const table = statsField.getByTestId("nested-array-table");
      const rows = table.locator("tbody tr[data-entry-id]");
      await expect(rows.filter({ hasText: firstLabel })).toHaveCount(1);
      await expect(rows.filter({ hasText: secondLabel })).toHaveCount(1);
      await expect.poll(orderedMatchingLabels).toBe(`${firstLabel}|${secondLabel}`);

      recorder.clear();
      await rows
        .filter({ hasText: secondLabel })
        .getByTestId("nested-array-move-up")
        .click();
      await waitForEditorNetworkToSettle(page);
      expectGraphMutationOnly(recorder.entries(), "site", "stats reorder");
      await expect.poll(orderedMatchingLabels).toBe(`${secondLabel}|${firstLabel}`);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForEditorNetworkToSettle(page);
      await expect.poll(orderedMatchingLabels).toBe(`${secondLabel}|${firstLabel}`);
    });
  });

  test("accepts a team invitation through the wrong-account guard", async ({
    browser,
    page,
  }: {
    browser: Browser;
    page: Page;
  }) => {
    test.setTimeout(6 * 60 * 1000);

    await signInSelfHostedUser(page, coreUsers.owner);
    await expect(page).toHaveURL(/\/dashboard$/, {
      timeout: E2E_NAV_TIMEOUT,
    });

    await page.goto("/settings/team");
    const sendInvitation = async (email: string) => {
      const inviteInput = page
        .locator("label")
        .filter({ hasText: /^Invite operator$/ })
        .locator("xpath=following::input[1]");
      const sendButton = page.getByRole("button", { name: "Send invitation" });

      await expect(inviteInput).toBeEditable({ timeout: E2E_NAV_TIMEOUT });
      await inviteInput.fill(email);
      await expect(inviteInput).toHaveValue(email);
      await expect(sendButton).toBeEnabled({ timeout: E2E_NAV_TIMEOUT });
      const inviteResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/organization/invite-member") &&
          response.request().method() === "POST",
        { timeout: E2E_NAV_TIMEOUT },
      );
      await sendButton.click();
      expect((await inviteResponse).status()).toBe(200);
      await expect(
        page.getByText(
          "Invitation created. Use the logged invite URL from the server output.",
        ),
      ).toBeVisible();
    };

    await sendInvitation(coreUsers.wrongAccount.email);
    const wrongInvitationId = await getLatestInvitationId(
      coreUsers.wrongAccount.email,
    );
    expect(wrongInvitationId).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 5_000 })
      .catch(() => {});
    await expect(
      page.getByRole("button", { name: "Send invitation" }),
    ).toBeEnabled({ timeout: E2E_NAV_TIMEOUT });
    await sendInvitation(coreUsers.invitee.email);

    const invitationId = await getLatestInvitationId(coreUsers.invitee.email);
    expect(invitationId).toBeTruthy();

    const invitePath = `/settings/team/accept-invitation/${invitationId}`;
    const inviteeContext = await browser.newContext({
      baseURL: coreE2EConfig.baseUrl,
    });
    const inviteePage = await inviteeContext.newPage();

    await signUpSelfHostedUser(
      inviteePage,
      coreUsers.wrongAccount,
      `/signup?invitationId=${wrongInvitationId}&redirect=/dashboard`,
    );
    await expect(inviteePage).toHaveURL(/\/dashboard$/, {
      timeout: E2E_NAV_TIMEOUT,
    });
    await inviteePage.goto(invitePath);
    await expect(
      inviteePage.getByText(
        "This invitation was sent to a different email than the one in your active session.",
      ),
    ).toBeVisible();
    await inviteePage
      .getByRole("button", { name: "Sign out and continue" })
      .click();
    await expect(inviteePage).toHaveURL(
      new RegExp(
        `/signup\\?invitationId=${invitationId}&redirect=${encodeURIComponent(invitePath)}`,
      ),
    );
    await signUpSelfHostedUser(
      inviteePage,
      coreUsers.invitee,
      `/signup?invitationId=${invitationId}&redirect=${encodeURIComponent(invitePath)}`,
    );
    await expect(inviteePage).toHaveURL(new RegExp(`${invitePath}$`), {
      timeout: E2E_NAV_TIMEOUT,
    });
    await inviteePage
      .getByRole("button", { name: "Accept invitation" })
      .click();
    await expect(inviteePage).toHaveURL(/\/settings\/team$/, {
      timeout: E2E_NAV_TIMEOUT,
    });
    await expect(
      inviteePage.getByRole("row").filter({
        hasText: coreUsers.invitee.email,
      }),
    ).toBeVisible();

    await inviteeContext.close();

    await expect
      .poll(() => getOrganizationMembershipCount(coreUsers.invitee.email))
      .toBeGreaterThan(0);
    await expect
      .poll(() => getTeamMembershipCount(coreUsers.invitee.email))
      .toBeGreaterThan(0);
  });
});
