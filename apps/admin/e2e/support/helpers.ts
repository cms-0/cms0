import { expect, type Locator, type Page } from "@playwright/test";

import type {
  ExampleArticleFixture,
  ExampleSiteFixture,
  CoreE2EUser,
} from "./fixtures";
import {
  coreE2EConfig,
  exampleDescriptor,
} from "./fixtures";

type FieldRoot = Page | Locator;

const findCollectionRow = (page: Page, text: string): Locator =>
  page.getByRole("row").filter({ hasText: text });

const escapeForRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fieldLabelPattern = (label: string) =>
  escapeForRegex(label)
    .replace(/([a-z0-9])([A-Z])/g, "$1\\s+$2")
    .replace(/[-_\s]+/g, "\\s+");

const escapeCssAttribute = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const findFieldInput = (root: FieldRoot, label: string) =>
  root
    .locator(
      `[data-testid="object-form-field"][data-field-name="${escapeCssAttribute(label)}"]`,
    )
    .locator("input, textarea")
    .first()
    .or(
      root
        .locator("label")
        .filter({
          hasText: new RegExp(`^${fieldLabelPattern(label)}\\s*\\*?$`, "i"),
        })
        .locator("xpath=ancestor::*[@data-slot='field'][1]")
        .locator("input, textarea")
        .first(),
    )
    .first();

const fillFieldInput = async (
  root: FieldRoot,
  label: string,
  value: string,
) => {
  const input = findFieldInput(root, label);
  await input.click();
  await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await input.press("Backspace");
  await input.pressSequentially(value);
  await expect(input).toHaveValue(value);
};

const objectForm = (page: Page, apiPath: string) =>
  page.locator(`[data-testid="object-form"][data-api-path="${apiPath}"]`);

const waitForSiteGraphMutation = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`${coreE2EConfig.runtimeBasePath}/_graph/site/_mutate`) &&
      response.ok(),
  );

const submitObjectForm = async (page: Page, form: Locator) => {
  await Promise.all([
    waitForSiteGraphMutation(page),
    form.getByTestId("object-form-submit").click(),
  ]);
};

const waitForArticleGraphMutation = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response
        .url()
        .includes(`${coreE2EConfig.runtimeBasePath}/_graph/models/article/_mutate`) &&
      response.ok(),
  );

const waitForArticleSearch = (page: Page, search: string) =>
  page.waitForResponse((response) => {
    if (
      response.request().method() !== "GET" ||
      !response
        .url()
        .includes(`${coreE2EConfig.runtimeBasePath}/_graph/models/article`) ||
      !response.ok()
    ) {
      return false;
    }

    return new URL(response.url()).searchParams.get("search") === search;
  });

export const signUpSelfHostedUser = async (
  page: Page,
  user: CoreE2EUser,
  path = "/signup",
) => {
  await page.goto(path);
  await expect(page.locator("#signup-form")).toHaveAttribute(
    "data-hydrated",
    "true",
  );
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {});
  await page.locator("#selfhost-signup-name").fill(user.name);
  const emailInput = page.locator("#selfhost-signup-email");
  if ((await emailInput.getAttribute("readonly")) === null) {
    await emailInput.fill(user.email);
  } else {
    await expect(emailInput).toHaveValue(user.email);
  }
  await expect(emailInput).toHaveValue(user.email);
  const passwordInput = page.locator("#selfhost-signup-password");
  await passwordInput.fill(user.password);
  await expect(passwordInput).toHaveValue(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
};

export const signInSelfHostedUser = async (
  page: Page,
  user: CoreE2EUser,
  path = "/login",
) => {
  await page.goto(path);
  await expect(page.locator("#login-form")).toHaveAttribute(
    "data-hydrated",
    "true",
  );
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {});
  const emailInput = page.locator("#selfhost-login-email");
  const passwordInput = page.locator("#selfhost-login-password");
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);
  await expect(emailInput).toHaveValue(user.email);
  await expect(passwordInput).toHaveValue(user.password);
  await page.getByRole("button", { name: /^(Login|Sign in)$/ }).click();
};

export const signOutSelfHostedUser = async (page: Page) => {
  const legacyButton = page.getByRole("button", { name: "Sign out" });
  if (await legacyButton.isVisible().catch(() => false)) {
    await legacyButton.click();
    return;
  }

  await page.locator("button").filter({ hasText: "@" }).last().click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
};

export const publishExampleDescriptor = async (page: Page, version: string) => {
  const response = await page.request.post(
    `${coreE2EConfig.runtimeBasePath}/schema`,
    {
      data: {
        descriptor: exampleDescriptor,
        version,
      },
    },
  );

  expect(response.ok()).toBe(true);

  await expect
    .poll(async () => {
      const latest = await fetchSessionJson<{
        ok: true;
        snapshot: { version: string } | null;
      }>(page, `${coreE2EConfig.runtimeBasePath}/schema/latestSnapshot`);
      return latest.body?.snapshot?.version;
    }, { timeout: 30_000 })
    .toBe(version);
};

export const expectCollectionTitle = async (page: Page, title: string) => {
  await expect(page.getByTestId("collection-title").filter({ hasText: title }))
    .toBeVisible();
};

export const createArticleEntry = async (
  page: Page,
  article: ExampleArticleFixture,
) => {
  await page.getByTestId("collection-add").click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  await fillFieldInput(dialog, "title", article.title);
  await fillFieldInput(dialog, "slug", article.slug);
  await fillFieldInput(dialog, "excerpt", article.excerpt);
  await fillFieldInput(dialog, "tag", article.tag);
  await fillFieldInput(dialog, "publishedAt", article.publishedAt);
  await dialog.getByRole("checkbox").click();
  await Promise.all([
    waitForArticleGraphMutation(page),
    dialog.getByRole("button", { name: "Create" }).click(),
  ]);
  await expect(dialog).toBeHidden();
  await expect(findCollectionRow(page, article.title)).toBeVisible();
};

export const updateArticleEntry = async (
  page: Page,
  currentTitle: string,
  article: ExampleArticleFixture,
) => {
  await page.getByTestId("collection-search").fill(currentTitle);
  await expect(findCollectionRow(page, currentTitle)).toBeVisible();
  await findCollectionRow(page, currentTitle)
    .getByTestId("collection-edit")
    .click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  await fillFieldInput(dialog, "title", article.title);
  await fillFieldInput(dialog, "slug", article.slug);
  await fillFieldInput(dialog, "excerpt", article.excerpt);
  await fillFieldInput(dialog, "tag", article.tag);
  await fillFieldInput(dialog, "publishedAt", article.publishedAt);
  const featured = dialog.getByRole("checkbox");
  const isChecked = await featured.isChecked();
  if (article.featured !== isChecked) {
    await featured.click();
  }
  await Promise.all([
    waitForArticleGraphMutation(page),
    dialog.getByRole("button", { name: "Save Changes" }).click(),
  ]);
  await expect(dialog).toBeHidden();
  const search = page.getByTestId("collection-search");
  await search.fill("");
  await expect(search).toHaveValue("");
  await Promise.all([waitForArticleSearch(page, article.title), search.fill(article.title)]);
  await expect(findCollectionRow(page, article.title)).toBeVisible();
};

export const deleteArticleEntry = async (page: Page, title: string) => {
  await page.getByTestId("collection-search").fill(title);
  await expect(findCollectionRow(page, title)).toBeVisible();
  await findCollectionRow(page, title)
    .getByTestId("collection-delete")
    .click();
  await expect(findCollectionRow(page, title)).toHaveCount(0);
};

export const replaceSiteContent = async (
  page: Page,
  site: ExampleSiteFixture,
) => {
  const announcementForm = objectForm(page, "site/announcement");
  await fillFieldInput(announcementForm, "label", site.announcementLabel);
  await fillFieldInput(
    announcementForm,
    "message",
    site.announcementMessage,
  );
  await submitObjectForm(page, announcementForm);

  const heroForm = objectForm(page, "site/hero");
  await fillFieldInput(heroForm, "eyebrow", site.heroEyebrow);
  await fillFieldInput(heroForm, "title", site.heroTitle);
  await fillFieldInput(heroForm, "subtitle", site.heroSubtitle);
  await fillFieldInput(
    heroForm,
    "primaryCtaLabel",
    site.primaryCtaLabel,
  );
  await fillFieldInput(heroForm, "primaryCtaHref", site.primaryCtaHref);
  await fillFieldInput(
    heroForm,
    "secondaryCtaLabel",
    site.secondaryCtaLabel,
  );
  await fillFieldInput(
    heroForm,
    "secondaryCtaHref",
    site.secondaryCtaHref,
  );
  await submitObjectForm(page, heroForm);

  const statsField = page.locator(
    '[data-testid="object-form-field"][data-field-name="stats"]',
  );
  for (const stat of site.stats) {
    await statsField.getByTestId("nested-array-add").click();
    const sheet = page.getByRole("dialog").last();
    await expect(sheet).toBeVisible();
    await fillFieldInput(sheet, "label", stat.label);
    await fillFieldInput(sheet, "value", stat.value);
    await Promise.all([
      waitForSiteGraphMutation(page),
      sheet.getByRole("button", { name: "Add" }).click(),
    ]);
    await expect(sheet).toBeHidden();
    await expect(statsField.getByTestId("nested-array-table")).toContainText(
      stat.label,
    );
  }
};

export const fetchSessionJson = async <T>(
  page: Page,
  path: string,
  method: "GET" | "POST" = "GET",
) => {
  const response = await page.request.fetch(`${coreE2EConfig.baseUrl}${path}`, {
    headers: {
      accept: "application/json",
    },
    method,
  });
  const body = await response.text();
  let parsedBody: T | null = null;
  if (body) {
    try {
      parsedBody = JSON.parse(body) as T;
    } catch {
      parsedBody = null;
    }
  }

  return {
    body: parsedBody,
    ok: response.ok(),
    status: response.status(),
  };
};

export const fetchRuntimeJsonWithApiKey = async <T>(
  path: string,
  apiKey: string,
) => {
  const response = await fetch(`${coreE2EConfig.baseUrl}${path}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await response.text();

  return {
    body: text ? (JSON.parse(text) as T) : null,
    ok: response.ok,
    status: response.status,
  };
};
