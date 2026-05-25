import { describe, expect, it } from "vitest";

import { buildContentNavigationTree } from "../../src/components/schema-descriptor-representation/content-navigation-tree";

describe("content navigation tree", () => {
  it("builds ordered recursive object paths for descriptor roots", () => {
    const tree = buildContentNavigationTree(
      {
        HomePage: {
          properties: {
            heroSection: {
              properties: {
                callToAction: {
                  properties: {
                    label: { type: "string" },
                  },
                  type: "object",
                },
              },
              type: "object",
            },
            title: { type: "string" },
          },
          type: "object",
        },
        PricingPage: {
          properties: {
            plans: { items: { type: "object" }, type: "array" },
          },
          type: "object",
        },
      },
      ["PricingPage", "HomePage"],
    );

    expect(tree).toMatchObject([
      {
        label: "PricingPage",
        pathSegments: ["PricingPage"],
        children: [
          {
            label: "plans",
            pathSegments: ["PricingPage", "plans"],
          },
        ],
      },
      {
        label: "HomePage",
        pathSegments: ["HomePage"],
        children: [
          {
            label: "heroSection",
            pathSegments: ["HomePage", "heroSection"],
            children: [
              {
                label: "callToAction",
                pathSegments: ["HomePage", "heroSection", "callToAction"],
              },
            ],
          },
        ],
      },
    ]);
  });
});
