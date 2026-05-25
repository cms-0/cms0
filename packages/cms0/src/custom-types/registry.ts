import {
  computeUnionBranchKeys,
  type FieldDescriptor,
  type ModelDescriptor,
  type PrimitiveType,
} from "@cms0/shared";

const primitive = (type: PrimitiveType): FieldDescriptor => ({
  kind: "primitive",
  type,
  optional: false,
  nullable: false,
});

const fileFieldDescriptors: Record<string, FieldDescriptor> = {
  name: primitive("string"),
  filename: primitive("string"),
  storageKey: {
    kind: "primitive",
    type: "string",
    optional: true,
    nullable: false,
  },
  extension: primitive("string"),
  mimeType: primitive("string"),
  size: primitive("number"),
};

const fileDescriptor: ModelDescriptor = {
  kind: "model",
  properties: fileFieldDescriptors,
  presentation: {
    kind: "asset",
    assetKind: "file",
  },
};

const imageDescriptor: ModelDescriptor = {
  kind: "model",
  properties: {
    ...fileFieldDescriptors,
    width: primitive("number"),
    height: primitive("number"),
    alt: { kind: "primitive", type: "string", optional: true, nullable: false },
  },
  presentation: {
    kind: "asset",
    assetKind: "image",
  },
};

const videoDescriptor: ModelDescriptor = {
  kind: "model",
  properties: {
    ...fileFieldDescriptors,
    width: primitive("number"),
    height: primitive("number"),
    length: primitive("number"),
    alt: { kind: "primitive", type: "string", optional: true, nullable: false },
  },
  presentation: {
    kind: "asset",
    assetKind: "video",
  },
};

const richTextDescriptor: FieldDescriptor = {
  kind: "primitive",
  type: "json",
  customType: "RichText",
};

const localizedStringDescriptor: FieldDescriptor = {
  kind: "primitive",
  type: "json",
  customType: "LocalizedString",
};

const localizedRichTextDescriptor: FieldDescriptor = {
  kind: "primitive",
  type: "json",
  customType: "LocalizedRichText",
};

function createUnionDescriptor(branches: FieldDescriptor[]): FieldDescriptor {
  return {
    kind: "union",
    anyOf: branches,
    branchKeys: computeUnionBranchKeys(branches),
  };
}

const localizedOrStringDescriptor: FieldDescriptor = createUnionDescriptor([
    localizedStringDescriptor,
    {
      kind: "primitive",
      type: "string",
    },
  ]);

const keywordsDescriptor: FieldDescriptor = createUnionDescriptor([
    localizedStringDescriptor,
    {
      type: "array",
      items: {
        kind: "primitive",
        type: "string",
      },
    },
  ]);

const robotsDescriptor: FieldDescriptor = {
  type: "object",
  properties: {
    index: {
      kind: "primitive",
      type: "boolean",
      optional: true,
      nullable: false,
    },
    follow: {
      kind: "primitive",
      type: "boolean",
      optional: true,
      nullable: false,
    },
    nocache: {
      kind: "primitive",
      type: "boolean",
      optional: true,
      nullable: false,
    },
  },
};

const alternatesDescriptor: FieldDescriptor = {
  type: "object",
  properties: {
    canonical: {
      kind: "primitive",
      type: "string",
      optional: true,
      nullable: false,
    },
    languages: {
      kind: "primitive",
      type: "json",
      optional: true,
      nullable: false,
    },
  },
};

const imageOrStringDescriptor: FieldDescriptor = createUnionDescriptor([
    {
      kind: "modelRef",
      model: "Image",
    },
    {
      kind: "primitive",
      type: "string",
    },
  ]);

const openGraphDescriptor: FieldDescriptor = {
  type: "object",
  properties: {
    type: {
      kind: "enum",
      valueType: "string",
      values: ["website", "article", "profile"],
      optional: true,
      nullable: false,
    },
    url: {
      kind: "primitive",
      type: "string",
      optional: true,
      nullable: false,
    },
    siteName: {
      kind: "primitive",
      type: "string",
      optional: true,
      nullable: false,
    },
    title: {
      ...localizedOrStringDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    description: {
      ...localizedOrStringDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    images: {
      type: "array",
      items: imageOrStringDescriptor,
      optional: true,
      nullable: false,
    },
    locale: {
      kind: "primitive",
      type: "string",
      optional: true,
      nullable: false,
    },
    alternateLocale: {
      type: "array",
      items: {
        kind: "primitive",
        type: "string",
      },
      optional: true,
      nullable: false,
    },
  },
};

const twitterDescriptor: FieldDescriptor = {
  type: "object",
  properties: {
    card: {
      kind: "enum",
      valueType: "string",
      values: ["summary", "summary_large_image", "app", "player"],
      optional: true,
      nullable: false,
    },
    site: {
      kind: "primitive",
      type: "string",
      optional: true,
      nullable: false,
    },
    creator: {
      kind: "primitive",
      type: "string",
      optional: true,
      nullable: false,
    },
    title: {
      ...localizedOrStringDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    description: {
      ...localizedOrStringDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    images: {
      type: "array",
      items: imageOrStringDescriptor,
      optional: true,
      nullable: false,
    },
  },
};

const seoDescriptor: FieldDescriptor = {
  type: "object",
  customType: "Seo",
  properties: {
    title: {
      ...localizedOrStringDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    description: {
      ...localizedOrStringDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    keywords: {
      ...keywordsDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    canonical: {
      kind: "primitive",
      type: "string",
      optional: true,
      nullable: false,
    },
    robots: {
      ...robotsDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    alternates: {
      ...alternatesDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    openGraph: {
      ...openGraphDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    twitter: {
      ...twitterDescriptor,
      optional: true,
      nullable: false,
    } as FieldDescriptor,
    jsonLd: {
      type: "array",
      items: {
        kind: "primitive",
        type: "json",
      },
      optional: true,
      nullable: false,
    },
  },
};

export const customModelDescriptors = {
  File: fileDescriptor,
  Image: imageDescriptor,
  Video: videoDescriptor,
} as const;

export const customInlineDescriptors = {
  RichText: richTextDescriptor,
  LocalizedString: localizedStringDescriptor,
  LocalizedRichText: localizedRichTextDescriptor,
  Seo: seoDescriptor,
} as const;

export type CustomInlineTypeName = keyof typeof customInlineDescriptors;

export type CustomInlineTypeMetadata = {
  includeId?: {
    // Object keys that are map-like containers (not entity nodes).
    mapLikeFields?: readonly string[];
  };
};

export const customInlineTypeMetadata: Record<
  CustomInlineTypeName,
  CustomInlineTypeMetadata
> = {
  RichText: {},
  LocalizedString: {
    includeId: { mapLikeFields: ["locales"] },
  },
  LocalizedRichText: {
    includeId: { mapLikeFields: ["locales"] },
  },
  Seo: {},
};

export const customTypeDescriptors = {
  ...customModelDescriptors,
  ...customInlineDescriptors,
} as const;

export type CustomTypeName = keyof typeof customTypeDescriptors;

export const customTypeNames = new Set<string>(Object.keys(customTypeDescriptors));
export const customModelTypeNames = new Set<string>(
  Object.keys(customModelDescriptors)
);
export const customInlineTypeNames = new Set<string>(
  Object.keys(customInlineDescriptors)
);

export function getCustomInlineTypeMetadata(
  name: string,
): CustomInlineTypeMetadata | undefined {
  return customInlineTypeMetadata[name as CustomInlineTypeName];
}

export function resolveCustomTypeDependencies(names: Iterable<string>): Set<string> {
  const resolved = new Set<string>();
  const queue = Array.from(names);

  while (queue.length) {
    const name = queue.shift();
    if (!name || resolved.has(name)) continue;
    const modelDescriptor =
      customModelDescriptors[name as keyof typeof customModelDescriptors];
    const inlineDescriptor =
      customInlineDescriptors[name as keyof typeof customInlineDescriptors];
    const descriptor = modelDescriptor ?? inlineDescriptor;
    if (!descriptor) continue;
    resolved.add(name);

    const refs = new Set<string>();
    if (modelDescriptor) {
      for (const prop of Object.values(modelDescriptor.properties)) {
        collectModelRefs(prop, refs);
      }
    } else {
      collectModelRefs(inlineDescriptor, refs);
    }

    refs.forEach((ref) => {
      if (customTypeDescriptors[ref as CustomTypeName] && !resolved.has(ref)) {
        queue.push(ref);
      }
    });
  }

  return resolved;
}

function collectModelRefs(desc: FieldDescriptor, out: Set<string>) {
  if (desc.kind === "modelRef") {
    out.add(desc.model);
    return;
  }

  if ("type" in desc && desc.type === "array") {
    collectModelRefs(desc.items, out);
    return;
  }

  if ("type" in desc && desc.type === "object") {
    Object.values(desc.properties).forEach((child) => collectModelRefs(child, out));
    return;
  }

  if (desc.kind === "union") {
    desc.anyOf.forEach((branch) => collectModelRefs(branch, out));
  }
}
