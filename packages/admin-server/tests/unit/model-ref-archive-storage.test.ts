import { describe, expect, it } from "vitest";

import {
  generateContentTables,
  generateEsmSchemaCode,
} from "../../src/schema-generator";
import {
  BACKUP_FORMAT_VERSION,
  normalizeModelRefArchivePayload,
  type BackupPayload,
} from "../../src/schema-backup";

const descriptor = {
  models: {
    Image: {
      kind: "model",
      properties: {
        filename: { kind: "primitive", type: "string" },
      },
    },
    Link: {
      kind: "model",
      properties: {
        href: { kind: "primitive", type: "string" },
        icon: { kind: "modelRef", model: "Image", optional: true },
      },
    },
    Testimonial: {
      kind: "model",
      properties: {
        quote: { kind: "primitive", type: "string" },
        avatar: { kind: "modelRef", model: "Image", optional: true },
      },
    },
    Plan: {
      kind: "model",
      properties: {
        cta: { kind: "modelRef", model: "Link" },
        icon: { kind: "modelRef", model: "Image", optional: true },
        testimonials: {
          type: "array",
          items: { kind: "modelRef", model: "Testimonial" },
        },
      },
    },
    ProductOfferingCategory: {
      kind: "model",
      properties: {
        name: { kind: "primitive", type: "string" },
      },
    },
    ProductOffering: {
      kind: "model",
      properties: {
        category: {
          kind: "modelRef",
          model: "ProductOfferingCategory",
        },
        cta: { kind: "modelRef", model: "Link" },
        image: { kind: "modelRef", model: "Image" },
      },
    },
    MarketplacePage: {
      kind: "model",
      properties: {
        quoteSection: {
          type: "object",
          properties: {
            image: { kind: "modelRef", model: "Image" },
            logo: { kind: "modelRef", model: "Image" },
          },
        },
      },
    },
  },
  roots: {},
} as any;

describe("modelRef archive storage contract", () => {
  it("generates property-based columns for direct modelRefs", () => {
    const result = generateContentTables(descriptor);
    const schema = generateEsmSchemaCode(descriptor);

    expect(schema).toContain('avatarId: uuid("avatar_id")');
    expect(schema).toContain('iconId: uuid("icon_id")');
    expect(schema).toContain('ctaId: uuid("cta_id")');
    expect(schema).toContain('categoryId: uuid("category_id")');
    expect(schema).toContain('logoId: uuid("logo_id")');
    expect(schema).toContain('testimonialId: uuid("testimonial_id").notNull()');

    expect(result.modelRefColumnAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "testimonial",
          propertyName: "avatar",
          canonicalDbName: "avatar_id",
          legacyDbName: "image_id",
        }),
        expect.objectContaining({
          tableName: "link",
          propertyName: "icon",
          canonicalDbName: "icon_id",
          legacyDbName: "image_id",
        }),
        expect.objectContaining({
          tableName: "plan",
          propertyName: "cta",
          canonicalDbName: "cta_id",
          legacyDbName: "link_id",
        }),
        expect.objectContaining({
          tableName: "product_offering",
          propertyName: "category",
          canonicalDbName: "category_id",
          legacyDbName: "product_offering_category_id",
        }),
        expect.objectContaining({
          tableName: "marketplace_page_quote_section",
          propertyName: "logo",
          canonicalDbName: "logo_id",
          legacyDbName: "image_id",
        }),
      ]),
    );
  });

  it("normalizes unambiguous bad-period archive columns before restore", () => {
    const payload: BackupPayload = {
      format: BACKUP_FORMAT_VERSION,
      createdAt: "2026-03-30T06:00:44.206Z",
      descriptor,
      descriptorChecksum: "checksum",
      tables: [
        {
          name: "testimonial",
          rows: [
            { id: "testimonial-1", image_id: "image-1" },
            {
              id: "testimonial-2",
              avatar_id: "image-2",
              image_id: "legacy-image-2",
            },
          ],
        },
        {
          name: "marketplace_page_quote_section",
          rows: [{ id: "quote-1", image_id: "image-3" }],
        },
      ],
    };

    const normalized = normalizeModelRefArchivePayload(payload);
    const testimonialRows = normalized.payload.tables.find(
      (table) => table.name === "testimonial",
    )?.rows;
    const quoteRows = normalized.payload.tables.find(
      (table) => table.name === "marketplace_page_quote_section",
    )?.rows;

    expect(testimonialRows?.[0]).toMatchObject({
      avatar_id: "image-1",
      image_id: "image-1",
    });
    expect(testimonialRows?.[1]).toMatchObject({
      avatar_id: "image-2",
      image_id: "legacy-image-2",
    });
    expect(normalized.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "testimonial",
          legacyDbName: "image_id",
          canonicalDbName: "avatar_id",
          rowCount: 1,
        }),
      ]),
    );
    expect(quoteRows?.[0]).not.toHaveProperty("logo_id");
    expect(normalized.warnings.join("\n")).toContain(
      "marketplace_page_quote_section.image_id",
    );
  });
});
