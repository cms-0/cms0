import assert from "node:assert/strict";
import { test } from "vitest";
import {
  attachCms0ProvenanceRoot,
  captureCms0Provenance,
  dehydrateCms0CanvasTransportValue,
  dehydrateCms0CanvasVisibleValue,
  enableCms0ProvenanceTracking,
  readCms0ProvenanceValueMeta,
  registerCms0CollectionItemIdentity,
} from "../../src/provenance.js";

test("captureCms0Provenance resolves an exact field path", () => {
  enableCms0ProvenanceTracking(true);

  const root = attachCms0ProvenanceRoot(
    {
      planSection: {
        learnMoreUrl: "/pricing",
      },
    },
    "HomePage",
  );

  const captured = captureCms0Provenance(() => root.planSection.learnMoreUrl);

  assert.equal(captured.value, "/pricing");
  assert.equal(captured.mapping?.fieldId, "HomePage.planSection.learnMoreUrl");
  assert.deepEqual(captured.mapping?.paths, ["HomePage.planSection.learnMoreUrl"]);
  assert.equal(captured.mapping?.confidence, "exact");
});

test("captureCms0Provenance collapses array indices into canonical field paths", () => {
  enableCms0ProvenanceTracking(true);

  const root = attachCms0ProvenanceRoot(
    {
      features: [{ title: "One" }, { title: "Two" }],
    },
    "HomePage",
  );

  const captured = captureCms0Provenance(() => [root.features[0]?.title, root.features[1]?.title].join(", "));

  assert.equal(captured.mapping?.fieldId, "HomePage.features.title");
  assert.deepEqual(captured.mapping?.paths, ["HomePage.features.title"]);
});

test("captureCms0Provenance uses hidden collection-entry ids for duplicate model refs", () => {
  enableCms0ProvenanceTracking(true);

  const first = { id: "feature-1", title: "First copy" };
  const second = { id: "feature-1", title: "Second copy" };
  registerCms0CollectionItemIdentity(first, "entry-1");
  registerCms0CollectionItemIdentity(second, "entry-2");

  const root = attachCms0ProvenanceRoot(
    {
      features: [first, second],
    },
    "HomePage",
  );

  const captured = captureCms0Provenance(() => root.features[1]?.title);

  assert.ok(
    captured.mapping?.captures?.some(
      (capture) => capture.rawPath === "HomePage.features.[#entry-2].title",
    ),
  );
});

test("captureCms0Provenance keeps model entity lineage for helper-wrapped repeated model refs", () => {
  enableCms0ProvenanceTracking(true);

  const feature = {
    id: "feature-model-1",
    title: {
      defaultLocale: "en",
      locales: {
        en: { html: "<p>Feature title</p>" },
      },
    },
  };
  registerCms0CollectionItemIdentity(feature, "entry-1");

  const root = attachCms0ProvenanceRoot(
    {
      features: [feature],
    },
    "HomePage",
  );

  const captured = captureCms0Provenance(
    () => root.features[0]?.title?.locales?.en?.html ?? "",
  );

  assert.equal(
    captured.mapping?.entityIds?.["HomePage.features.[#entry-1]"],
    "feature-model-1",
  );
  assert.ok(
    captured.mapping?.captures?.some(
      (capture) => capture.rawPath === "HomePage.features.[#entry-1].title",
    ),
  );
});

test("dehydrateCms0CanvasVisibleValue preserves visible array shape without transport wrappers", () => {
  enableCms0ProvenanceTracking(true);

  const plans = attachCms0ProvenanceRoot(
    [
      {
        id: "plan-1",
        title: {
          defaultLocale: "en",
          locales: {
            en: "Starter",
          },
        },
      },
    ],
    "HomePage.planSection.plans",
  );

  const visible = dehydrateCms0CanvasVisibleValue(plans) as Array<Record<string, unknown>>;
  const transport = dehydrateCms0CanvasTransportValue(plans) as Record<string, unknown>;

  assert.equal(Array.isArray(visible), true);
  assert.equal(Array.isArray(transport), false);
  assert.equal(visible[0]?.id, "plan-1");
  assert.equal(
    (visible[0]?.title as { locales?: Record<string, string> } | undefined)?.locales?.en,
    "Starter",
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(visible[0] ?? {}, "__cms0CanvasCollectionItemId"),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(transport, "__cms0CanvasTransport"),
    true,
  );
});

test("dehydrateCms0CanvasVisibleValue strips root toJSON transport drift from fetched object props", () => {
  enableCms0ProvenanceTracking(true);

  const header = attachCms0ProvenanceRoot(
    {
      loginText: {
        defaultLocale: "en",
        locales: {
          en: "Log in",
        },
      },
      signupText: {
        defaultLocale: "en",
        locales: {
          en: "Sign up",
        },
      },
    },
    "Header",
  );

  const visible = dehydrateCms0CanvasVisibleValue(header) as Record<string, unknown>;
  const transport = dehydrateCms0CanvasTransportValue(header) as Record<string, unknown>;

  assert.equal(
    Object.prototype.hasOwnProperty.call(visible, "__cms0CanvasTransport"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(transport, "__cms0CanvasTransport"),
    true,
  );
  assert.equal(
    ((visible.loginText as { locales?: Record<string, string> } | undefined)?.locales ?? {}).en,
    "Log in",
  );
  assert.equal((visible as { toJSON?: unknown }).toJSON, undefined);
  assert.equal(readCms0ProvenanceValueMeta(visible)?.rawPath, "Header");
});

test("dehydrateCms0CanvasVisibleValue keeps provenance capture working for visible clones", () => {
  enableCms0ProvenanceTracking(true);

  const links = [
    {
      href: "/",
      label: {
        defaultLocale: "en",
        locales: {
          en: "Home",
        },
      },
    },
  ];
  registerCms0CollectionItemIdentity(links[0], "home");

  const header = attachCms0ProvenanceRoot(
    {
      navLinks: links,
    },
    "Header",
  );

  const visible = dehydrateCms0CanvasVisibleValue(header) as {
    navLinks: Array<{
      label: {
        locales: Record<string, string>;
      };
    }>;
  };

  const captured = captureCms0Provenance(
    () => visible.navLinks[0]?.label.locales.en,
  );

  assert.equal(captured.value, "Home");
  assert.ok(captured.mapping);
  assert.equal(captured.mapping?.rootId, "Header");
  assert.equal(captured.mapping?.scopeId, "Header.navLinks");
  assert.ok(
    captured.mapping?.captures?.some(
      (capture) => capture.rawPath === "Header.navLinks.[#home].label.locales.en",
    ),
  );
});
