import { Cms0APIConfig } from "@cms0/cms0/config";
import {
  attachCms0ProvenanceRoot,
  enableCms0ProvenanceTracking,
  isCms0CanvasTransportEnabled,
  registerCms0CollectionItemIdentity,
} from "@cms0/cms0/provenance";
import {
  ensureBrowserSchemaDescriptorDevSubscription,
  getActiveSchemaDescriptor,
  invalidateBrowserSchemaDescriptorCache,
  resolveBrowserSchemaDescriptor,
  schemaDescriptor,
} from "@cms0/cms0/schema-descriptors";
import {
  buildZodSchemasFromDescriptor,
  decodeTaggedUnionValue,
  FieldDescriptor,
  FullDescriptor,
  deriveAssetFilenameFromStorageKey,
  deriveAssetKindFromStorageKey,
  getAssetLogicalPath,
  getUnionBranchKeys,
  inferAssetKindFromFilename,
  normalizeAssetFilename,
  serializeGraphQueryOptions,
  type AssetKind,
  type GraphOrderDirection,
  type GraphPathQueryOptions,
  type GraphQueryOptions,
  type GraphFilterClause,
  type WhereClause,
} from "@cms0/shared";
import { getCustomInlineTypeMetadata } from "./custom-types/registry.js";
import type {
  LocalizedRichText as CmsLocalizedRichText,
  Seo as CmsSeo,
  LocalizedString as CmsLocalizedString,
  RichText as CmsRichText,
} from "./custom-types/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __CMS0_CANVAS_CLIENT__:
    | {
        apiBaseUrl?: string;
        locales?: string[];
        defaultLocale?: string;
        publishTriggerId?: string;
        readRoot?: (
          rootId: string,
          options?: {
            apiKey?: string;
            locale?: string;
            includeId?: boolean;
          },
        ) => Promise<unknown>;
      }
    | undefined;
}

type QueryValue = string | number | boolean | null | undefined;
type QueryParam = QueryValue | QueryValue[];

export type CmsOrderDirection = GraphOrderDirection;

export type CmsGraphFieldQuery = GraphPathQueryOptions;

export interface CmsQuery {
  raw?: string | number | boolean;
  [key: string]: QueryParam;
}

export type CmsResponseMode = "normalized" | "envelope" | "raw";

export interface CmsAssetOptions {
  baseUrl?: string;
  uploadsPath?: string;
  resolveUrl?: (asset: {
    filename: string;
    kind: AssetKind;
    storageKey?: string;
  }) => string | undefined;
}

type JoinPath<Prefix extends string, Key extends string> = Prefix extends ""
  ? Key
  : `${Prefix}.${Key}`;

type CmsPathInternal<
  T,
  Prefix extends string = "",
  Depth extends number[] = [],
> = Depth["length"] extends 8
  ? never
  : T extends Array<infer Item>
    ? CmsPathInternal<Item, Prefix, [1, ...Depth]>
    : T extends object
      ? IsMapLikeObject<T> extends true
        ? Prefix extends ""
          ? never
          : Prefix
        : {
            [K in Extract<keyof T, string>]:
              | JoinPath<Prefix, K>
              | CmsPathInternal<T[K], JoinPath<Prefix, K>, [1, ...Depth]>;
          }[Extract<keyof T, string>]
      : never;

type IsAny<T> = 0 extends 1 & T ? true : false;

export type CmsFieldPath<T> = IsAny<T> extends true
  ? string
  : Exclude<CmsPathInternal<T>, "">;
export type CmsFieldSelector<T> = CmsFieldPath<T> | CmsFieldPath<T>[];

type CmsArrayPathInternal<
  T,
  Prefix extends string = "",
  Depth extends number[] = [],
> = Depth["length"] extends 8
  ? never
  : T extends readonly (infer Item)[]
    ? Prefix extends ""
      ? CmsArrayPathInternal<Item, Prefix, [1, ...Depth]>
      : Prefix | CmsArrayPathInternal<Item, Prefix, [1, ...Depth]>
    : T extends object
      ? IsMapLikeObject<T> extends true
        ? never
        : {
            [K in Extract<keyof T, string>]: CmsArrayPathInternal<
              T[K],
              JoinPath<Prefix, K>,
              [1, ...Depth]
            >;
          }[Extract<keyof T, string>]
      : never;

export type CmsArrayFieldPath<T> = IsAny<T> extends true
  ? string
  : Exclude<CmsArrayPathInternal<T>, "">;

export type CmsGraphPathQuery<TValue = any> = IsAny<TValue> extends true
  ? Record<string, CmsGraphFieldQuery>
  : Partial<Record<CmsArrayFieldPath<TValue>, CmsGraphFieldQuery>>;

export type CmsGraphOptions<TValue = any> = Omit<
  GraphQueryOptions,
  "fields" | "exclude" | "paths"
> & {
  paths?: CmsGraphPathQuery<TValue>;
};

export interface CmsAccessorOptions<TValue = any> {
  query?: CmsQuery;
  graph?: CmsGraphOptions<TValue>;
  response?: CmsResponseMode;
  includeId?: boolean;
  locale?: string;
  fields?: CmsFieldSelector<TValue>;
  exclude?: CmsFieldSelector<TValue>;
  signal?: AbortSignal;
}

export type CmsCollectionEnvelope<T> = {
  items: T[];
  total: number;
};

type CmsAccessorBaseOptions<TValue> = Omit<
  CmsAccessorOptions<TValue>,
  "includeId"
>;

type IsLocalizedShape<T> = T extends {
  defaultLocale: string;
  locales: Record<string, any>;
}
  ? true
  : false;

type IsMapLikeObject<T> = string extends keyof T ? true : false;

type WithCollectionItemObjectIds<T> =
  T extends Array<infer Item>
    ? Array<
        Item extends object
          ? WithCollectionItemObjectIds<Item> & { id: string }
          : Item
      >
    : T extends object
      ? { [K in keyof T]: WithCollectionItemObjectIds<T[K]> }
      : T;

type WithAllObjectIds<T> =
  T extends Array<infer Item>
    ? Array<
        Item extends object
          ? WithAllObjectIds<Item>
          : { id: string; value: Item }
      >
    : T extends object
      ? IsLocalizedShape<T> extends true
        ? { id: string } & {
            [K in keyof T]: K extends "locales" ? T[K] : WithAllObjectIds<T[K]>;
          }
        : IsMapLikeObject<T> extends true
          ? T
          : { id: string } & { [K in keyof T]: WithAllObjectIds<T[K]> }
      : T;

type DefaultAccessorResult<
  T,
  IncludeIdDefault extends boolean,
> = IncludeIdDefault extends true
  ? WithAllObjectIds<T>
  : WithCollectionItemObjectIds<T>;

type CmsTopLevelField<T> = IsAny<T> extends true
  ? string
  : Extract<keyof NonNullable<T>, string>;

type CmsTopLevelProjection<T, Field extends string> = IsAny<T> extends true
  ? any
  : Pick<NonNullable<T>, Extract<Field, keyof NonNullable<T>>>;

type CmsTopLevelProjectionOptions<T, Field extends string> = Omit<
  CmsAccessorOptions<T>,
  "fields" | "includeId" | "response"
> & {
  fields: Field;
  includeId?: false;
};

type CmsEnvelopeResponse<T> = {
  items: T;
  total: number;
};

type DeepPartial<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly (infer Item)[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

type CmsMutationValue<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? DeepPartial<T>
    : T;

export type CmsAccessor<T, IncludeIdDefault extends boolean = false> = {
  <const Field extends CmsTopLevelField<T>>(
    options: CmsTopLevelProjectionOptions<T, Field>,
  ): Promise<CmsTopLevelProjection<T, Field>>;
  (
    options: CmsAccessorBaseOptions<WithAllObjectIds<T>> & {
      response: "envelope";
      includeId: true;
    },
  ): Promise<CmsEnvelopeResponse<WithAllObjectIds<T>>>;
  (
    options: CmsAccessorBaseOptions<T> & {
      response: "envelope";
      includeId: false;
    },
  ): Promise<CmsEnvelopeResponse<T>>;
  (
    options: CmsAccessorBaseOptions<
      DefaultAccessorResult<T, IncludeIdDefault>
    > & {
      response: "envelope";
      includeId?: undefined;
    },
  ): Promise<CmsEnvelopeResponse<DefaultAccessorResult<T, IncludeIdDefault>>>;
  (
    options: CmsAccessorBaseOptions<WithAllObjectIds<T>> & { includeId: true },
  ): Promise<WithAllObjectIds<T>>;
  (options: CmsAccessorBaseOptions<T> & { includeId: false }): Promise<T>;
  (
    options?: CmsAccessorBaseOptions<
      DefaultAccessorResult<T, IncludeIdDefault>
    > & {
      includeId?: undefined;
    },
  ): Promise<DefaultAccessorResult<T, IncludeIdDefault>>;
};

type DefaultModelByIdResult<
  T,
  IncludeIdDefault extends boolean,
> = IncludeIdDefault extends true ? WithAllObjectIds<T> | null : T | null;

type CmsModelByIdAccessor<T, IncludeIdDefault extends boolean = false> = {
  (
    id: string,
    options: CmsAccessorBaseOptions<WithAllObjectIds<T>> & {
      response: "envelope";
      includeId: true;
    },
  ): Promise<CmsEnvelopeResponse<WithAllObjectIds<T> | null>>;
  (
    id: string,
    options: CmsAccessorBaseOptions<T> & {
      response: "envelope";
      includeId: false;
    },
  ): Promise<CmsEnvelopeResponse<T | null>>;
  (
    id: string,
    options: CmsAccessorBaseOptions<
      DefaultModelByIdResult<T, IncludeIdDefault>
    > & {
      response: "envelope";
      includeId?: undefined;
    },
  ): Promise<CmsEnvelopeResponse<DefaultModelByIdResult<T, IncludeIdDefault>>>;
  (
    id: string,
    options: CmsAccessorBaseOptions<WithAllObjectIds<T>> & { includeId: true },
  ): Promise<WithAllObjectIds<T> | null>;
  (
    id: string,
    options: CmsAccessorBaseOptions<T> & { includeId: false },
  ): Promise<T | null>;
  (
    id: string,
    options?: CmsAccessorBaseOptions<
      DefaultModelByIdResult<T, IncludeIdDefault>
    > & {
      includeId?: undefined;
    },
  ): Promise<DefaultModelByIdResult<T, IncludeIdDefault>>;
};

export type CmsModelAccessor<T, IncludeIdDefault extends boolean = false> = {
  (
    options: CmsAccessorBaseOptions<WithAllObjectIds<T[]>> & {
      response: "envelope";
      includeId: true;
    },
  ): Promise<CmsEnvelopeResponse<WithAllObjectIds<T[]>>>;
  (
    options: CmsAccessorBaseOptions<T[]> & {
      response: "envelope";
      includeId: false;
    },
  ): Promise<CmsEnvelopeResponse<T[]>>;
  (
    options: CmsAccessorBaseOptions<
      DefaultAccessorResult<T[], IncludeIdDefault>
    > & {
      response: "envelope";
      includeId?: undefined;
    },
  ): Promise<CmsEnvelopeResponse<DefaultAccessorResult<T[], IncludeIdDefault>>>;
  (
    options: CmsAccessorBaseOptions<WithAllObjectIds<T[]>> & {
      includeId: true;
    },
  ): Promise<WithAllObjectIds<T[]>>;
  (options: CmsAccessorBaseOptions<T[]> & { includeId: false }): Promise<T[]>;
  (
    options?: CmsAccessorBaseOptions<
      DefaultAccessorResult<T[], IncludeIdDefault>
    > & {
      includeId?: undefined;
    },
  ): Promise<DefaultAccessorResult<T[], IncludeIdDefault>>;
  byId: CmsModelByIdAccessor<T, IncludeIdDefault>;
  list(options?: CmsAccessorOptions): Promise<T[]>;
  get(id: string, options?: CmsAccessorOptions): Promise<T | null>;
  create(value: T): Promise<T>;
  update(id: string, value: DeepPartial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  where(
    clause: WhereClause<T>,
    options?: CmsAccessorOptions,
  ): Promise<T[]>;
  whereFirst(
    clause: WhereClause<T>,
    options?: CmsAccessorOptions,
  ): Promise<T | null>;
};

export type CmsMeta<IncludeIdDefault extends boolean = false> = {
  locales: string[];
  defaultLocale?: string;
  includeIdDefault: IncludeIdDefault;
};

export type CmsRootAccessor<T, IncludeIdDefault extends boolean = false> = {
  <const Field extends CmsTopLevelField<T>>(
    options: CmsTopLevelProjectionOptions<T, Field>,
  ): Promise<CmsTopLevelProjection<T, Field>>;
  (
    options: CmsAccessorBaseOptions<WithAllObjectIds<T>> & {
      response: "envelope";
      includeId: true;
    },
  ): Promise<CmsEnvelopeResponse<WithAllObjectIds<T>>>;
  (
    options: CmsAccessorBaseOptions<T> & {
      response: "envelope";
      includeId: false;
    },
  ): Promise<CmsEnvelopeResponse<T>>;
  (
    options: CmsAccessorBaseOptions<
      DefaultAccessorResult<T, IncludeIdDefault>
    > & {
      response: "envelope";
      includeId?: undefined;
    },
  ): Promise<CmsEnvelopeResponse<DefaultAccessorResult<T, IncludeIdDefault>>>;
  (
    options: CmsAccessorBaseOptions<WithAllObjectIds<T>> & {
      includeId: true;
    },
  ): Promise<WithAllObjectIds<T>>;
  (options: CmsAccessorBaseOptions<T> & { includeId: false }): Promise<T>;
  (
    options?: CmsAccessorBaseOptions<
      DefaultAccessorResult<T, IncludeIdDefault>
    > & {
      includeId?: undefined;
    },
  ): Promise<DefaultAccessorResult<T, IncludeIdDefault>>;
  update(value: DeepPartial<T>): Promise<void>;
} & CmsFieldChildren<T, IncludeIdDefault>;

export type CmsFieldAccessor<T, IncludeIdDefault extends boolean = false> =
  CmsAccessor<T, IncludeIdDefault> & {
    delete(): Promise<void>;
    set(value: CmsMutationValue<T>): Promise<void>;
    update(value: CmsMutationValue<T>): Promise<void>;
  } & CmsFieldChildren<T, IncludeIdDefault>;

type CmsFieldChildren<T, IncludeIdDefault extends boolean> =
  NonNullable<T> extends readonly (infer Item)[]
    ? {
        append(value: Item): Promise<void>;
        at(index: number): CmsFieldAccessor<Item, IncludeIdDefault>;
        insert(index: number, value: Item): Promise<void>;
        where(
          clause: WhereClause<Item>,
          options?: CmsAccessorOptions,
        ): Promise<Item[]>;
        whereFirst(
          clause: WhereClause<Item>,
          options?: CmsAccessorOptions,
        ): Promise<Item | null>;
      }
    : NonNullable<T> extends object
      ? IsMapLikeObject<NonNullable<T>> extends true
        ? {}
        : {
            [K in Extract<
              keyof NonNullable<T>,
              string
            >]: CmsFieldAccessor<NonNullable<T>[K], IncludeIdDefault>;
          }
      : {};

export type CmsInstance<
  Roots,
  Models extends Record<string, any> = Record<string, never>,
  IncludeIdDefault extends boolean = false,
> = {
  [K in keyof Roots]: CmsRootAccessor<Roots[K], IncludeIdDefault>;
} & {
  models: {
    [K in keyof Models]: CmsModelAccessor<Models[K], IncludeIdDefault>;
  };
} & {
  meta: CmsMeta<IncludeIdDefault>;
};

export interface Cms0Options {
  apiConfig: Cms0APIConfig;
  locales?: string[];
  defaultLocale?: string;
  assets?: CmsAssetOptions;
  includeId?: boolean;
  canvas?: {
    publishTriggerId?: string;
  };
}

export interface Cms0GeneratedTypes {}

type PrimitiveValueFromDescriptor<TypeName extends string> =
  TypeName extends "string"
    ? string
    : TypeName extends "number"
      ? number
      : TypeName extends "boolean"
        ? boolean
        : any;

type EnumValueTypeFromDescriptor<TypeName extends string> =
  TypeName extends "string"
    ? string
    : TypeName extends "number"
      ? number
      : TypeName extends "boolean"
        ? boolean
        : never;

type EnumLiteralFromDescriptor<
  ValueType extends string,
  Values,
> = Values extends readonly (infer Literal)[]
  ? Literal extends EnumValueTypeFromDescriptor<ValueType>
    ? Literal
    : EnumValueTypeFromDescriptor<ValueType>
  : EnumValueTypeFromDescriptor<ValueType>;

type CustomTypeValueFromDescriptor<TypeName extends string> =
  TypeName extends "RichText"
    ? CmsRichText
    : TypeName extends "LocalizedString"
      ? CmsLocalizedString
      : TypeName extends "LocalizedRichText"
        ? CmsLocalizedRichText
        : TypeName extends "Seo"
          ? CmsSeo
          : never;

type ApplyDescriptorFlags<Descriptor, Value> = Descriptor extends {
  optional: true;
  nullable: true;
}
  ? Value | null | undefined
  : Descriptor extends { optional: true }
    ? Value | undefined
    : Descriptor extends { nullable: true }
      ? Value | null
      : Value;

type InferDescriptorObject<
  Properties extends Record<string, any>,
  ModelMap extends Record<string, any>,
> = {
  [Key in keyof Properties]: InferDescriptorField<Properties[Key], ModelMap>;
};

type InferUnionBranches<
  Branches,
  ModelMap extends Record<string, any>,
> = Branches extends readonly (infer Branch)[]
  ? InferDescriptorField<Branch, ModelMap>
  : any;

type InferDescriptorField<
  Descriptor,
  ModelMap extends Record<string, any>,
> = ApplyDescriptorFlags<
  Descriptor,
  Descriptor extends { customType: infer CustomType extends string }
    ? CustomTypeValueFromDescriptor<CustomType> extends never
      ? Descriptor extends {
          kind: "modelRef";
          model: infer ModelName extends string;
        }
        ? ModelName extends keyof ModelMap
          ? ModelMap[ModelName]
          : string
        : Descriptor extends {
              kind: "primitive";
              type: infer Primitive extends string;
            }
          ? PrimitiveValueFromDescriptor<Primitive>
          : Descriptor extends {
                kind: "enum";
                valueType: infer ValueType extends string;
                values: infer Values;
              }
            ? EnumLiteralFromDescriptor<ValueType, Values>
            : Descriptor extends { kind: "union"; anyOf: infer Branches }
              ? InferUnionBranches<Branches, ModelMap>
              : Descriptor extends { type: "array"; items: infer Items }
                ? Array<InferDescriptorField<Items, ModelMap>>
                : Descriptor extends {
                      type: "object";
                      properties: infer Properties extends Record<string, any>;
                    }
                  ? InferDescriptorObject<Properties, ModelMap>
                  : Descriptor extends { type: infer Primitive extends string }
                    ? PrimitiveValueFromDescriptor<Primitive>
                    : any
      : CustomTypeValueFromDescriptor<CustomType>
    : Descriptor extends {
          kind: "modelRef";
          model: infer ModelName extends string;
        }
      ? ModelName extends keyof ModelMap
        ? ModelMap[ModelName]
        : string
      : Descriptor extends {
            kind: "primitive";
            type: infer Primitive extends string;
          }
        ? PrimitiveValueFromDescriptor<Primitive>
        : Descriptor extends {
              kind: "enum";
              valueType: infer ValueType extends string;
              values: infer Values;
            }
          ? EnumLiteralFromDescriptor<ValueType, Values>
          : Descriptor extends { kind: "union"; anyOf: infer Branches }
            ? InferUnionBranches<Branches, ModelMap>
            : Descriptor extends { type: "array"; items: infer Items }
              ? Array<InferDescriptorField<Items, ModelMap>>
              : Descriptor extends {
                    type: "object";
                    properties: infer Properties extends Record<string, any>;
                  }
                ? InferDescriptorObject<Properties, ModelMap>
                : Descriptor extends { type: infer Primitive extends string }
                  ? PrimitiveValueFromDescriptor<Primitive>
                  : any
>;

export type Cms0InferDescriptorModels<Models extends Record<string, any>> = {
  [ModelName in keyof Models]: Models[ModelName] extends {
    properties: infer Properties extends Record<string, any>;
  }
    ? WithInferredAssetUrl<
        InferDescriptorObject<Properties, Cms0InferDescriptorModels<Models>>,
        Properties
      >
    : any;
};

type WithInferredAssetUrl<
  Shape,
  Properties extends Record<string, any>,
> = Properties extends {
  filename: any;
  extension: any;
  mimeType: any;
  size: any;
}
  ? Shape & { url: string }
  : Shape;

export type Cms0InferDescriptorRoots<
  Roots extends Record<string, any>,
  Models extends Record<string, any>,
> = {
  [RootKey in keyof Roots]: InferDescriptorField<Roots[RootKey], Models>;
};

type BundledGeneratedModels = Cms0InferDescriptorModels<
  typeof schemaDescriptor.models
>;
type BundledGeneratedRoots = Cms0InferDescriptorRoots<
  typeof schemaDescriptor.roots,
  BundledGeneratedModels
>;

type GeneratedModelsOverride = Cms0GeneratedTypes extends {
  models: infer Models extends Record<string, any>;
}
  ? Models
  : never;

type GeneratedRootsOverride = Cms0GeneratedTypes extends { roots: infer Roots }
  ? Roots
  : never;

type GeneratedModels = [GeneratedModelsOverride] extends [never]
  ? BundledGeneratedModels
  : GeneratedModelsOverride;

type GeneratedRoots = [GeneratedRootsOverride] extends [never]
  ? BundledGeneratedRoots
  : GeneratedRootsOverride;

type ResourceKind = "root" | "model";

type ResourceEntry = {
  kind: ResourceKind;
  key: string;
  path: string;
  descriptor: FieldDescriptor;
  isCollection: boolean;
  modelName?: string;
};

type IncludeIdMode = "none" | "collections" | "all";
type AssetUrlBuilder = (asset: {
  filename: string;
  kind: AssetKind;
  storageKey?: string;
}) => string;

type NormalizerOptions = {
  includeIdMode: IncludeIdMode;
  resolveModelRefs: boolean;
  locale?: string;
  defaultLocale?: string;
  assetUrlBuilder: AssetUrlBuilder;
  modelNormalizationConcurrency: number;
  includeProjectionPaths: string[][];
  excludeProjectionPaths: string[][];
};

type RequestContext = {
  requestJson: (
    path: string,
    options?: {
      query?: CmsQuery;
      graph?: GraphQueryOptions;
      signal?: AbortSignal;
    },
  ) => Promise<any>;
  modelDescriptors: Map<string, FieldDescriptor>;
  modelCache: Map<string, Promise<any>>;
  sharedModelInflightCache: Map<string, Promise<any>>;
  canvasModelRefCollectionIdentityCache?: Map<
    string,
    Promise<CanvasModelRefCollectionIdentity[] | null>
  >;
  options: NormalizerOptions;
};

type CanvasModelRefCollectionIdentity = {
  relationId: string;
  modelId: string | null;
};

type ModelRefOptions = {
  propertyName?: string;
  allowObjectIdFallback?: boolean;
};

const DEFAULT_MODEL_NORMALIZATION_CONCURRENCY = 8;

const COLLECTION_SHAPE_ERROR =
  "Invalid collection response. Expected array, { items, total }, or { data, pagination }.";

function normalizeUploadsPath(uploadsPath: string | undefined): string {
  const raw = uploadsPath?.trim() || "/uploads";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = withLeadingSlash.replace(/\/+$/, "");
  return normalized || "/uploads";
}

function normalizeAssetBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim() ?? "";
  return trimmed.replace(/\/+$/, "");
}

function encodeFilenameForUrl(filename: string): string {
  const normalized = normalizeAssetFilename(filename);
  if (!normalized) return "";
  return normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveAssetUrlSuffix(
  uploadsPath: string,
  asset: {
    filename: string;
    kind: AssetKind;
    storageKey?: string;
  },
): string {
  const storageKey = asset.storageKey?.trim();
  const derivedSuffix = storageKey?.startsWith("uploads/")
    ? storageKey.slice("uploads/".length)
    : getAssetLogicalPath(asset.kind, asset.filename).slice("uploads/".length);

  if (
    uploadsPath.endsWith("/uploads/images") ||
    uploadsPath.endsWith("/uploads/videos") ||
    uploadsPath.endsWith("/uploads/files")
  ) {
    return encodeFilenameForUrl(asset.filename);
  }

  if (uploadsPath !== "/uploads" && !uploadsPath.endsWith("/uploads")) {
    return encodeFilenameForUrl(asset.filename);
  }

  return encodeFilenameForUrl(derivedSuffix);
}

function buildAssetUrlBuilder(
  apiBaseUrl: string,
  assetOptions: CmsAssetOptions | undefined,
): AssetUrlBuilder {
  const uploadsPath = normalizeUploadsPath(assetOptions?.uploadsPath);
  const customResolver = assetOptions?.resolveUrl;

  const explicitBaseUrl = normalizeAssetBaseUrl(assetOptions?.baseUrl);
  if (explicitBaseUrl) {
    return (asset) => {
      const customUrl = customResolver?.(asset)?.trim();
      if (customUrl) return customUrl;
      return `${explicitBaseUrl}${uploadsPath}/${resolveAssetUrlSuffix(uploadsPath, asset)}`;
    };
  }

  let inferredBaseUrl = "";
  try {
    inferredBaseUrl = new URL(apiBaseUrl).origin;
  } catch {
    inferredBaseUrl = "";
  }

  return (asset) => {
    const customUrl = customResolver?.(asset)?.trim();
    if (customUrl) return customUrl;
    return `${inferredBaseUrl}${uploadsPath}/${resolveAssetUrlSuffix(uploadsPath, asset)}`;
  };
}

function maybeAttachAssetUrl(
  value: unknown,
  assetUrlBuilder: AssetUrlBuilder,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const source = value as Record<string, unknown>;
  const storageKey =
    typeof source.storageKey === "string" ? source.storageKey.trim() : "";
  const filename =
    typeof source.filename === "string" && source.filename.trim().length > 0
      ? source.filename.trim()
      : deriveAssetFilenameFromStorageKey(storageKey) ?? "";
  if (!filename) return value;

  const isAssetShape =
    typeof source.mimeType === "string" ||
    typeof source.extension === "string" ||
    typeof source.size === "number" ||
    typeof source.width === "number" ||
    typeof source.height === "number" ||
    typeof source.length === "number";

  if (!isAssetShape) return value;

  const existingUrl =
    typeof source.url === "string" && source.url.trim().length > 0
      ? source.url
      : null;
  const kind =
    deriveAssetKindFromStorageKey(storageKey) ?? inferAssetKindFromFilename(filename);

  return {
    ...source,
    filename,
    ...(storageKey ? { storageKey } : {}),
    url:
      existingUrl ??
      assetUrlBuilder({
        filename,
        kind,
        ...(storageKey ? { storageKey } : {}),
      }),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.floor(concurrency));
  if (limit >= items.length) {
    return Promise.all(items.map((item, index) => mapper(item, index)));
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length) break;
        results[current] = await mapper(items[current]!, current);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function extractId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as any).id === "string"
  ) {
    return (value as any).id;
  }
  return null;
}

function isLikelyEntityObject(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  if (!keys.length) return false;
  if (keys.length === 1 && keys[0] === "id") return true;

  return keys.some(
    (key) =>
      key !== "id" &&
      key !== "value" &&
      key !== "__cms0Union" &&
      key !== "locales" &&
      key !== "defaultLocale" &&
      !key.endsWith("Id") &&
      !key.endsWith("_id") &&
      key !== "createdAt" &&
      key !== "updatedAt" &&
      key !== "created_at" &&
      key !== "updated_at" &&
      key !== "orderIndex" &&
      key !== "order_index",
  );
}

function capitalize(input: string) {
  return input ? input[0]!.toUpperCase() + input.slice(1) : input;
}

function lowerFirst(input: string) {
  return input ? input[0]!.toLowerCase() + input.slice(1) : input;
}

function camelCaseModelIdKey(modelName: string) {
  return `${lowerFirst(modelName)}Id`;
}

function snakeCaseModelIdKey(modelName: string) {
  const snake = modelName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
  return `${snake}_id`;
}

function isUuidLikeId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function extractModelRefId(
  raw: unknown,
  modelName: string,
  options?: ModelRefOptions,
): string | null {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return null;

  const object = raw as Record<string, unknown>;
  const prop = options?.propertyName ?? "";
  const propertyCandidates = [
    prop ? `${prop}Id` : "",
    prop
      ? `${prop.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}_id`
      : "",
  ].filter(Boolean);
  const modelCandidates = [
    camelCaseModelIdKey(modelName),
    snakeCaseModelIdKey(modelName),
  ];
  // Prefer property-specific FKs (e.g., logoId) over model-level defaults
  // (e.g., imageId) when multiple refs share the same model in one object row.
  const candidates = Array.from(
    new Set([...propertyCandidates, ...modelCandidates, "value"]),
  );

  for (const key of candidates) {
    const found = extractId(object[key]);
    if (found) return found;
  }

  const allowObjectIdFallback = options?.allowObjectIdFallback ?? true;
  if (allowObjectIdFallback) {
    const byId = extractId(object);
    const keys = Object.keys(object);
    const hasOnlyId = keys.length === 1 && keys[0] === "id";
    if (byId && (hasOnlyId || isLikelyEntityObject(object))) {
      return byId;
    }
  }

  return null;
}

function isPrimitiveDescriptor(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "primitive" }> {
  return (desc as any).kind === "primitive";
}

function isEnumDescriptor(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "enum" }> {
  return (desc as any).kind === "enum" && Array.isArray((desc as any).values);
}

function isUnionDescriptor(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "union" }> {
  return (desc as any).kind === "union" && Array.isArray((desc as any).anyOf);
}

function isScalarDescriptor(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "primitive" | "enum" | "union" }> {
  return (
    isPrimitiveDescriptor(desc) ||
    isEnumDescriptor(desc) ||
    isUnionDescriptor(desc)
  );
}

function isModelRefDescriptor(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "modelRef" }> {
  return (desc as any).kind === "modelRef";
}

function isObjectDescriptor(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { type: "object" }> {
  return (desc as any).type === "object" && !!(desc as any).properties;
}

function isArrayDescriptor(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { type: "array" }> {
  return (desc as any).type === "array" && !!(desc as any).items;
}

function attachIdIfObject<T>(value: T, id: string | null): T {
  if (!id) return value;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value as any).id
  ) {
    return { ...(value as any), id } as T;
  }
  return value;
}

function attachIdForScalarDescriptor(
  descriptor: FieldDescriptor,
  value: unknown,
  id: string | null,
) {
  const withId = attachIdIfObject(value, id);
  if (!withId || typeof withId !== "object" || Array.isArray(withId)) {
    return withId;
  }

  const customType = (descriptor as any).customType;
  if (typeof customType !== "string") {
    return withId;
  }

  const metadata = getCustomInlineTypeMetadata(customType);
  if (!metadata?.includeId?.mapLikeFields?.length) {
    return withId;
  }

  // Map-like objects (e.g., locales) are data containers, not entity rows.
  // Keep them untouched by id propagation.
  return { ...(withId as Record<string, unknown>) };
}

function buildModelRefCacheKey(
  modelName: string,
  id: string,
  context: RequestContext,
  isCollectionItem: boolean,
) {
  const locale = context.options.locale ?? "";
  const defaultLocale = context.options.defaultLocale ?? "";
  const includeIdMode = context.options.includeIdMode;
  const refsMode = context.options.resolveModelRefs ? "resolve" : "ids";
  const collectionFlag = isCollectionItem ? "collection" : "single";
  return [
    modelName,
    id,
    locale,
    defaultLocale,
    includeIdMode,
    refsMode,
    collectionFlag,
  ].join("|");
}

function extractInlineModelObject(
  raw: unknown,
  modelDescriptor: FieldDescriptor,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!isObjectDescriptor(modelDescriptor)) return null;

  const source = raw as Record<string, unknown>;
  const propertyKeys = Object.keys(modelDescriptor.properties ?? {});
  const hasModelField = propertyKeys.some((key) => key in source);
  if (!hasModelField) return null;

  return source;
}

function asModelObjectDescriptor(
  modelName: string,
  descriptor: FullDescriptor,
): FieldDescriptor {
  const model = descriptor.models?.[modelName];
  if (!model) {
    throw new Error(`Unknown model '${modelName}' in schema descriptor.`);
  }
  return {
    type: "object",
    properties: model.properties,
    optional: false,
    nullable: false,
  } as FieldDescriptor;
}

function formatValidationError(name: string, error: unknown) {
  const payload =
    error && typeof error === "object" && "format" in (error as any)
      ? (error as any).format()
      : error;
  return `Invalid data received for '${name}': ${JSON.stringify(payload)}`;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );
  for (let i = 0; i < rows; i++) matrix[i]![0] = i;
  for (let j = 0; j < cols; j++) matrix[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[rows - 1]![cols - 1]!;
}

function unknownKeyError(
  key: string,
  roots: string[],
  models: string[],
): never {
  const candidates = [...roots, ...models];
  const normalized = key.toLowerCase();
  const suggestions = candidates
    .map((candidate) => ({
      candidate,
      distance: levenshtein(normalized, candidate.toLowerCase()),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((entry) => entry.candidate);

  const suggestionText = suggestions.length
    ? ` Did you mean: ${suggestions.join(", ")}?`
    : "";
  const rootsText = `Available roots: [${roots.join(", ")}]`;
  const modelsText = models.length
    ? `, models (under data.models.*): [${models.join(", ")}]`
    : "";

  throw new Error(
    `Unknown schema key '${key}'. ${rootsText}${modelsText}.${suggestionText}`,
  );
}

function toPlainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (!value || typeof value !== "object") return "";

  const node = value as Record<string, unknown>;
  if (typeof node.text === "string") return node.text;
  if ("value" in node) return toPlainText((node as any).value);
  if (Array.isArray((node as any).content)) {
    return (node as any).content
      .map((child: unknown) => toPlainText(child))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "";
}

function coerceRichTextValue(value: unknown) {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const nested =
    source.value && typeof source.value === "object"
      ? (source.value as Record<string, unknown>)
      : null;

  const normalizedValue =
    source.value !== undefined ? source.value : (value ?? {});
  const html =
    typeof source.html === "string"
      ? source.html
      : typeof nested?.html === "string"
        ? nested.html
        : "";

  return {
    value: normalizedValue ?? {},
    html,
  };
}

type LocalizedMap<T> = {
  defaultLocale: string;
  locales: Record<string, T>;
};

function normalizeLocaleTag(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLocalizedMap<T>(
  source: unknown,
  normalizeValue: (value: unknown) => T,
): LocalizedMap<T> {
  const record =
    source && typeof source === "object"
      ? (source as Record<string, unknown>)
      : {};
  const localesSource =
    record.locales &&
    typeof record.locales === "object" &&
    !Array.isArray(record.locales)
      ? (record.locales as Record<string, unknown>)
      : {};
  const locales: Record<string, T> = {};

  for (const [locale, raw] of Object.entries(localesSource)) {
    const localeKey = normalizeLocaleTag(locale);
    if (!localeKey) continue;
    locales[localeKey] = normalizeValue(raw);
  }

  const explicitDefault = normalizeLocaleTag(record.defaultLocale);
  const firstLocale = Object.keys(locales)[0] ?? "";
  const defaultLocale = explicitDefault || firstLocale;

  return { defaultLocale, locales };
}

function projectLocalizedByLocale<T>(
  localized: LocalizedMap<T>,
  locale: string | undefined,
): LocalizedMap<T> {
  if (!locale || locale === "all") return localized;
  const requested = normalizeLocaleTag(locale);
  if (!requested) return localized;
  const requestedValue = localized.locales[requested];
  if (requestedValue === undefined) {
    return {
      defaultLocale: requested,
      locales: {},
    };
  }
  return {
    defaultLocale: requested,
    locales: {
      [requested]: requestedValue,
    },
  };
}

function coerceLocalizedStringValue(
  value: unknown,
  locale: string | undefined,
  defaultLocale: string | undefined,
) {
  const normalized = normalizeLocalizedMap<string>(value, (entry) =>
    toPlainText(entry),
  );
  if (!normalized.defaultLocale && defaultLocale) {
    normalized.defaultLocale = defaultLocale;
  }
  return projectLocalizedByLocale(normalized, locale);
}

function coerceLocalizedRichTextValue(
  value: unknown,
  locale: string | undefined,
  defaultLocale: string | undefined,
) {
  const normalized = normalizeLocalizedMap(value, (entry) =>
    coerceRichTextValue(entry),
  );
  if (!normalized.defaultLocale && defaultLocale) {
    normalized.defaultLocale = defaultLocale;
  }
  return projectLocalizedByLocale(normalized, locale);
}

function coerceSeoValue(value: unknown) {
  if (value == null) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const keys = Object.keys(source).filter((key) => key !== "id");
  if (
    keys.length === 1 &&
    keys[0] === "value" &&
    source.value &&
    typeof source.value === "object" &&
    !Array.isArray(source.value)
  ) {
    return source.value;
  }

  return source;
}

function coerceCustomTypeValue(
  descriptor: FieldDescriptor,
  value: unknown,
  options?: {
    locale?: string;
    defaultLocale?: string;
    assetUrlBuilder?: AssetUrlBuilder;
  },
) {
  const customType = (descriptor as any).customType;
  if (!customType) return value;

  if (customType === "RichText") return coerceRichTextValue(value);
  if (
    customType === "File" ||
    customType === "Image" ||
    customType === "Video"
  ) {
    return maybeAttachAssetUrl(
      value,
      options?.assetUrlBuilder ??
        ((asset) => asset.storageKey ?? asset.filename),
    );
  }
  if (customType === "LocalizedString") {
    return coerceLocalizedStringValue(
      value,
      options?.locale,
      options?.defaultLocale,
    );
  }
  if (customType === "LocalizedRichText") {
    return coerceLocalizedRichTextValue(
      value,
      options?.locale,
      options?.defaultLocale,
    );
  }
  if (customType === "Seo") {
    return coerceSeoValue(value);
  }
  return value;
}

function coercePrimitiveValueByType(
  type: "string" | "number" | "boolean" | "json",
  value: unknown,
) {
  if (type === "string") {
    if (value == null) return "";
    return typeof value === "string" ? value : String(value);
  }
  if (type === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    return Boolean(value);
  }
  return value;
}

function coerceEnumValue(
  descriptor: Extract<FieldDescriptor, { kind: "enum" }>,
  value: unknown,
) {
  const valueType = ((descriptor as any).valueType ?? "string") as
    | "string"
    | "number"
    | "boolean";
  const coerced = coercePrimitiveValueByType(valueType, value);
  const values = Array.isArray((descriptor as any).values)
    ? ((descriptor as any).values as unknown[])
    : [];
  if (!values.length) return coerced;
  if (values.some((entry) => Object.is(entry, coerced))) {
    return coerced;
  }
  return values[0];
}

function decodeUnionEnvelope(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  raw: unknown,
): { branchDescriptor: FieldDescriptor; branchValue: unknown } | null {
  const decoded = decodeTaggedUnionValue(raw);
  if (!decoded) return null;

  const branches = Array.isArray((descriptor as any).anyOf)
    ? ((descriptor as any).anyOf as FieldDescriptor[])
    : [];
  if (!branches.length) return null;

  const branchKeys = getUnionBranchKeys(descriptor);
  const branchIndex = branchKeys.findIndex((key) => key === decoded.branchKey);
  if (branchIndex < 0 || branchIndex >= branches.length) return null;
  const branchDescriptor = branches[branchIndex];
  if (!branchDescriptor) return null;

  return {
    branchDescriptor,
    branchValue: decoded.value,
  };
}

function decodeUnionValueFromRawField(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  raw: unknown,
): {
  branchDescriptor: FieldDescriptor;
  branchValue: unknown;
  rowId: string | null;
} | null {
  const direct = decodeUnionEnvelope(descriptor, raw);
  if (direct) {
    return { ...direct, rowId: extractId(raw) };
  }

  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "value" in (raw as any)
  ) {
    const nested = decodeUnionEnvelope(descriptor, (raw as any).value);
    if (nested) {
      return { ...nested, rowId: extractId(raw) };
    }
  }

  return null;
}

function ensureCollectionEnvelope(
  data: unknown,
  path: string,
): CmsCollectionEnvelope<any> {
  if (Array.isArray(data)) {
    return { items: data, total: data.length };
  }
  if (data && typeof data === "object" && Array.isArray((data as any).items)) {
    return {
      items: (data as any).items,
      total: Number((data as any).total ?? (data as any).items.length ?? 0),
    };
  }
  if (data && typeof data === "object" && Array.isArray((data as any).data)) {
    const pagination = (data as any).pagination;
    return {
      items: (data as any).data,
      total: Number(
        (pagination && typeof pagination === "object"
          ? pagination.total
          : undefined) ?? (data as any).data.length ?? 0,
      ),
    };
  }
  throw new Error(`${COLLECTION_SHAPE_ERROR} Path: '${path}'.`);
}

function encodeGraphPath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildGraphReadPath(path: string, id?: string): string {
  const graphPath = id ? `${path}/${id}` : path;
  return `_graph/${encodeGraphPath(graphPath)}`;
}

async function readCanvasModelRefCollectionIdentities(
  path: string,
  descriptor: Extract<FieldDescriptor, { kind: "modelRef" }>,
  context: RequestContext,
): Promise<CanvasModelRefCollectionIdentity[] | null> {
  const cache = context.canvasModelRefCollectionIdentityCache;
  if (!cache) return null;

  const cacheKey = [path, descriptor.model, context.options.locale ?? ""].join(
    "::",
  );
  const existing = cache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    try {
      const rawCollection = await context.requestJson(buildGraphReadPath(path), {
        query: {
          raw: 1,
          includeId: 1,
          resolveModelRefs: 0,
          ...(context.options.locale ? { locale: context.options.locale } : {}),
        },
      });
      const envelope = ensureCollectionEnvelope(rawCollection, path);
      return envelope.items.map((row) => ({
        relationId: extractId(row) ?? "",
        modelId:
          extractModelRefId(row, descriptor.model, {
            allowObjectIdFallback: false,
          }) ?? null,
      }));
    } catch {
      return null;
    }
  })();

  cache.set(cacheKey, pending);
  return pending;
}

async function normalizeModelRef(
  modelName: string,
  id: string | null,
  context: RequestContext,
  trail: Set<string>,
  isCollectionItem: boolean,
  inlineValue?: unknown,
  projectionPathTokens: readonly string[] = [],
): Promise<any> {
  if (!id) return null;
  if (!context.options.resolveModelRefs) return id;

  const nodeKey = buildModelRefCacheKey(
    modelName,
    id,
    context,
    isCollectionItem,
  );
  if (trail.has(nodeKey)) {
    return shouldIncludeObjectId(
      context.options.includeIdMode,
      isCollectionItem,
    )
      ? { id }
      : id;
  }

  const modelDescriptor = context.modelDescriptors.get(modelName);
  if (!modelDescriptor) {
    return id;
  }

  const inlineModel = extractInlineModelObject(inlineValue, modelDescriptor);
  const cached = context.modelCache.get(nodeKey);
  if (cached) {
    return cached;
  }

  const sharedInflight = context.sharedModelInflightCache.get(nodeKey);
  if (sharedInflight) {
    context.modelCache.set(nodeKey, sharedInflight);
    return sharedInflight;
  }

  const nextTrail = new Set(trail);
  nextTrail.add(nodeKey);

  const promise = (async () => {
    const modelPath = `models/${modelName}/${id}`;
    const resolvedModelPath = buildGraphReadPath(modelPath);
    const rawModel =
      inlineModel ??
      (await context.requestJson(resolvedModelPath, {
        query: {
          raw: 1,
          ...(context.options.locale ? { locale: context.options.locale } : {}),
          resolveModelRefs: 1,
        },
      }));
    return normalizeField(
      modelDescriptor,
      `models/${modelName}/${encodeURIComponent(id)}`,
      rawModel,
      context,
      nextTrail,
      isCollectionItem,
      projectionPathTokens,
    );
  })();

  context.modelCache.set(nodeKey, promise);
  context.sharedModelInflightCache.set(nodeKey, promise);
  promise
    .then(
      () => undefined,
      () => {
        context.modelCache.delete(nodeKey);
      },
    )
    .finally(() => {
      context.sharedModelInflightCache.delete(nodeKey);
    });
  return promise;
}

function missingModelRefValue(
  descriptor: Extract<FieldDescriptor, { kind: "modelRef" }>,
): null | undefined {
  if (descriptor.nullable) return null;
  if (descriptor.optional) return undefined;
  return null;
}

async function normalizeObjectField(
  descriptor: Extract<FieldDescriptor, { type: "object" }>,
  path: string,
  raw: unknown,
  context: RequestContext,
  trail: Set<string>,
  isCollectionItem: boolean,
  projectionPathTokens: readonly string[] = [],
): Promise<Record<string, any>> {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const output: Record<string, any> = {};

  for (const [propertyName, propertyDescriptor] of Object.entries(
    descriptor.properties,
  )) {
    const childProjectionPathTokens = [...projectionPathTokens, propertyName];
    if (
      !shouldTraverseProjectionPath(
        childProjectionPathTokens,
        context.options.includeProjectionPaths,
        context.options.excludeProjectionPaths,
      )
    ) {
      continue;
    }

    if (isScalarDescriptor(propertyDescriptor)) {
      output[propertyName] = await normalizeField(
        propertyDescriptor,
        `${path}/${propertyName}`,
        source[propertyName],
        context,
        trail,
        false,
        childProjectionPathTokens,
      );
      continue;
    }

    if (isModelRefDescriptor(propertyDescriptor)) {
      const inlineValue = source[propertyName];
      const inlineModelDescriptor = context.modelDescriptors.get(
        propertyDescriptor.model,
      );
      const inlineModel = inlineModelDescriptor
        ? extractInlineModelObject(inlineValue, inlineModelDescriptor)
        : null;
      const refId =
        extractModelRefId(inlineValue, propertyDescriptor.model, {
          allowObjectIdFallback: true,
        }) ??
        (inlineModel ? extractId(inlineModel) : null) ??
        extractModelRefId(source, propertyDescriptor.model, {
          propertyName,
          allowObjectIdFallback: false,
        });
      if (!refId) {
        const missing = missingModelRefValue(propertyDescriptor);
        if (missing !== undefined) {
          output[propertyName] = missing;
        }
        continue;
      }
      output[propertyName] = await normalizeModelRef(
        propertyDescriptor.model,
        refId,
        context,
        trail,
        false,
        inlineValue,
        childProjectionPathTokens,
      );
      continue;
    }

    if (isArrayDescriptor(propertyDescriptor)) {
      const childPath = `${path}/${propertyName}`;
      const inlineChildRaw = source[propertyName];
      if (inlineChildRaw === null) {
        output[propertyName] = null;
        continue;
      }
      const childRaw =
        inlineChildRaw !== undefined
          ? inlineChildRaw
          : await context.requestJson(buildGraphReadPath(childPath), {
              query: {
                raw: 1,
                ...(context.options.locale
                  ? { locale: context.options.locale }
                  : {}),
              },
            });
      const normalizedChild = await normalizeArrayField(
        propertyDescriptor,
        childPath,
        childRaw,
        context,
        trail,
        inlineChildRaw !== undefined,
        childProjectionPathTokens,
      );
      output[propertyName] = coerceCustomTypeValue(
        propertyDescriptor,
        normalizedChild,
        {
          locale: context.options.locale,
          defaultLocale: context.options.defaultLocale,
          assetUrlBuilder: context.options.assetUrlBuilder,
        },
      );
      continue;
    }

    if (isObjectDescriptor(propertyDescriptor)) {
      const childPath = `${path}/${propertyName}`;
      const inlineChildRaw = source[propertyName];
      if (inlineChildRaw === null) {
        output[propertyName] = null;
        continue;
      }
      const childRaw =
        inlineChildRaw !== undefined
          ? inlineChildRaw
          : await context.requestJson(buildGraphReadPath(childPath), {
              query: {
                raw: 1,
                ...(context.options.locale
                  ? { locale: context.options.locale }
                  : {}),
              },
            });
      const normalizedChild = await normalizeObjectField(
        propertyDescriptor,
        childPath,
        childRaw,
        context,
        trail,
        false,
        childProjectionPathTokens,
      );
      output[propertyName] = coerceCustomTypeValue(
        propertyDescriptor,
        normalizedChild,
        {
          locale: context.options.locale,
          defaultLocale: context.options.defaultLocale,
          assetUrlBuilder: context.options.assetUrlBuilder,
        },
      );
    }
  }

  if (shouldIncludeObjectId(context.options.includeIdMode, isCollectionItem)) {
    const rowId = extractId(source);
    if (rowId) output.id = rowId;
  }

  if (
    typeof source.url === "string" &&
    source.url.trim().length > 0 &&
    typeof output.filename === "string"
  ) {
    output.url = source.url;
  }

  return maybeAttachAssetUrl(output, context.options.assetUrlBuilder) as Record<
    string,
    any
  >;
}

async function normalizeArrayField(
  descriptor: Extract<FieldDescriptor, { type: "array" }>,
  path: string,
  raw: unknown,
  context: RequestContext,
  trail: Set<string>,
  inlineResolvedItems = false,
  projectionPathTokens: readonly string[] = [],
): Promise<any[]> {
  const envelope = ensureCollectionEnvelope(raw, path);
  const itemDescriptor = descriptor.items;

  if (isScalarDescriptor(itemDescriptor)) {
    return mapWithConcurrency(
      envelope.items,
      context.options.modelNormalizationConcurrency,
      async (row) => {
        const normalizedValue = await normalizeField(
          itemDescriptor,
          path,
          row,
          context,
          trail,
          true,
          projectionPathTokens,
        );

        if (context.options.includeIdMode !== "all") {
          return normalizedValue;
        }

        const id = extractId(row);
        const valueWithId: any = attachIdForScalarDescriptor(
          itemDescriptor,
          normalizedValue,
          id,
        );

        const isObjectValue =
          valueWithId &&
          typeof valueWithId === "object" &&
          !Array.isArray(valueWithId);
        if (!id) {
          return valueWithId;
        }

        return isObjectValue
          ? { id, ...valueWithId }
          : { id, value: valueWithId };
      },
    );
  }

  if (isModelRefDescriptor(itemDescriptor)) {
    const inlineModelDescriptor = context.modelDescriptors.get(
      itemDescriptor.model,
    );
    const collectionIdentities = await readCanvasModelRefCollectionIdentities(
      path,
      itemDescriptor,
      context,
    );
    return mapWithConcurrency(
      envelope.items,
      context.options.modelNormalizationConcurrency,
      async (row, index) => {
        const inlineModel = inlineModelDescriptor
          ? extractInlineModelObject(row, inlineModelDescriptor)
          : null;
        const refId =
          extractModelRefId(row, itemDescriptor.model, {
            allowObjectIdFallback: false,
          }) ?? (inlineModel ? extractId(inlineModel) : null);
        const normalized = await normalizeModelRef(
          itemDescriptor.model,
          refId,
          context,
          trail,
          true,
          row,
          projectionPathTokens,
        );
        const collectionItemId =
          collectionIdentities?.[index]?.relationId ??
          (inlineResolvedItems ? null : extractId(row));
        if (
          !collectionItemId ||
          !normalized ||
          typeof normalized !== "object" ||
          Array.isArray(normalized)
        ) {
          return normalized;
        }

        const normalizedClone = {
          ...(normalized as Record<string, unknown>),
        };
        registerCms0CollectionItemIdentity(normalizedClone, collectionItemId);
        delete normalizedClone.__cms0CanvasCollectionItemId;
        return normalizedClone;
      },
    );
  }

  if (isObjectDescriptor(itemDescriptor)) {
    return mapWithConcurrency(
      envelope.items,
      context.options.modelNormalizationConcurrency,
      async (row) => {
        const rowId = extractId(row);
        const rowPath = rowId ? `${path}/${encodeURIComponent(rowId)}` : path;
        return normalizeObjectField(
          itemDescriptor,
          rowPath,
          row,
          context,
          trail,
          true,
          projectionPathTokens,
        );
      },
    );
  }

  return envelope.items;
}

async function normalizeInlineField(
  descriptor: FieldDescriptor,
  raw: unknown,
  context: RequestContext,
  trail: Set<string>,
  isCollectionItem: boolean,
  projectionPathTokens: readonly string[] = [],
): Promise<any> {
  if (isPrimitiveDescriptor(descriptor)) {
    return coerceCustomTypeValue(descriptor, raw, {
      locale: context.options.locale,
      defaultLocale: context.options.defaultLocale,
      assetUrlBuilder: context.options.assetUrlBuilder,
    });
  }

  if (isEnumDescriptor(descriptor)) {
    return coerceEnumValue(descriptor, raw);
  }

  if (isUnionDescriptor(descriptor)) {
    if (raw == null) return raw;
    const decoded = decodeUnionEnvelope(descriptor, raw);
    if (!decoded) {
      return null;
    }
    return normalizeInlineField(
      decoded.branchDescriptor,
      decoded.branchValue,
      context,
      trail,
      isCollectionItem,
      projectionPathTokens,
    );
  }

  if (isModelRefDescriptor(descriptor)) {
    const refId = extractModelRefId(raw, descriptor.model, {
      allowObjectIdFallback: true,
    });
    if (!refId) {
      return missingModelRefValue(descriptor);
    }
    return normalizeModelRef(
      descriptor.model,
      refId,
      context,
      trail,
      isCollectionItem,
      raw,
      projectionPathTokens,
    );
  }

  if (isArrayDescriptor(descriptor)) {
    const source = Array.isArray(raw) ? raw : [];
    const normalized = await mapWithConcurrency(
      source,
      context.options.modelNormalizationConcurrency,
      async (entry) =>
        normalizeInlineField(
          descriptor.items,
          entry,
          context,
          trail,
          true,
          projectionPathTokens,
        ),
    );
    return coerceCustomTypeValue(descriptor, normalized, {
      locale: context.options.locale,
      defaultLocale: context.options.defaultLocale,
      assetUrlBuilder: context.options.assetUrlBuilder,
    });
  }

  if (isObjectDescriptor(descriptor)) {
    const source =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const output: Record<string, unknown> = {};
    for (const [propertyName, propertyDescriptor] of Object.entries(
      descriptor.properties,
    )) {
      output[propertyName] = await normalizeInlineField(
        propertyDescriptor,
        source[propertyName],
        context,
        trail,
        false,
        [...projectionPathTokens, propertyName],
      );
    }
    return coerceCustomTypeValue(descriptor, output, {
      locale: context.options.locale,
      defaultLocale: context.options.defaultLocale,
      assetUrlBuilder: context.options.assetUrlBuilder,
    });
  }

  return raw;
}

async function normalizeField(
  descriptor: FieldDescriptor,
  path: string,
  raw: unknown,
  context: RequestContext,
  trail: Set<string>,
  isCollectionItem: boolean,
  projectionPathTokens: readonly string[] = [],
): Promise<any> {
  if (isPrimitiveDescriptor(descriptor)) {
    const value =
      raw && typeof raw === "object" && "value" in (raw as any)
        ? (raw as any).value
        : raw;
    let coerced = coerceCustomTypeValue(descriptor, value, {
      locale: context.options.locale,
      defaultLocale: context.options.defaultLocale,
      assetUrlBuilder: context.options.assetUrlBuilder,
    });
    if (
      shouldIncludeObjectId(context.options.includeIdMode, isCollectionItem)
    ) {
      const id = extractId(raw);
      coerced = attachIdForScalarDescriptor(descriptor, coerced, id);
    }
    return coerced;
  }

  if (isEnumDescriptor(descriptor)) {
    const value =
      raw && typeof raw === "object" && "value" in (raw as any)
        ? (raw as any).value
        : raw;
    let coerced = coerceEnumValue(descriptor, value);
    if (
      shouldIncludeObjectId(context.options.includeIdMode, isCollectionItem)
    ) {
      const id = extractId(raw);
      coerced = attachIdForScalarDescriptor(descriptor, coerced, id);
    }
    return coerced;
  }

  if (isUnionDescriptor(descriptor)) {
    const decoded = decodeUnionValueFromRawField(descriptor, raw);
    if (!decoded) {
      return null;
    }
    let normalized = await normalizeInlineField(
      decoded.branchDescriptor,
      decoded.branchValue,
      context,
      trail,
      isCollectionItem,
      projectionPathTokens,
    );

    if (
      shouldIncludeObjectId(context.options.includeIdMode, isCollectionItem)
    ) {
      const id = decoded.rowId ?? extractId(raw);
      normalized = attachIdForScalarDescriptor(descriptor, normalized, id);
    }

    return normalized;
  }

  if (isModelRefDescriptor(descriptor)) {
    const inlineModelDescriptor = context.modelDescriptors.get(
      descriptor.model,
    );
    const inlineModel = inlineModelDescriptor
      ? extractInlineModelObject(raw, inlineModelDescriptor)
      : null;
    const refId =
      extractModelRefId(raw, descriptor.model, {
        allowObjectIdFallback: true,
      }) ?? (inlineModel ? extractId(inlineModel) : null);
    if (!refId) {
      return missingModelRefValue(descriptor);
    }
    return normalizeModelRef(
      descriptor.model,
      refId,
      context,
      trail,
      isCollectionItem,
      raw,
    );
  }

  if (isArrayDescriptor(descriptor)) {
    const normalized = await normalizeArrayField(
      descriptor,
      path,
      raw,
      context,
      trail,
      false,
      projectionPathTokens,
    );
    return coerceCustomTypeValue(descriptor, normalized, {
      locale: context.options.locale,
      defaultLocale: context.options.defaultLocale,
      assetUrlBuilder: context.options.assetUrlBuilder,
    });
  }

  if (isObjectDescriptor(descriptor)) {
    const normalized = await normalizeObjectField(
      descriptor,
      path,
      raw,
      context,
      trail,
      isCollectionItem,
      projectionPathTokens,
    );
    return coerceCustomTypeValue(descriptor, normalized, {
      locale: context.options.locale,
      defaultLocale: context.options.defaultLocale,
      assetUrlBuilder: context.options.assetUrlBuilder,
    });
  }

  return raw;
}

function createResourceRegistry(descriptor: FullDescriptor) {
  const roots = new Map<string, ResourceEntry>();
  const rootsCaseInsensitive = new Map<string, ResourceEntry>();

  for (const [key, rootDescriptor] of Object.entries(descriptor.roots ?? {})) {
    const entry: ResourceEntry = {
      kind: "root",
      key,
      path: key,
      descriptor: rootDescriptor,
      isCollection: isArrayDescriptor(rootDescriptor),
    };
    roots.set(key, entry);
    rootsCaseInsensitive.set(key.toLowerCase(), entry);
  }

  const models = new Map<string, ResourceEntry>();
  const modelsCaseInsensitive = new Map<string, ResourceEntry>();

  for (const modelName of Object.keys(descriptor.models ?? {})) {
    const entry: ResourceEntry = {
      kind: "model",
      key: modelName,
      path: `models/${modelName}`,
      descriptor: asModelObjectDescriptor(modelName, descriptor),
      isCollection: true,
      modelName,
    };
    models.set(modelName, entry);
    modelsCaseInsensitive.set(modelName.toLowerCase(), entry);
  }

  return {
    roots,
    rootsCaseInsensitive,
    models,
    modelsCaseInsensitive,
  };
}

function normalizeBaseUrl(baseUrl?: string) {
  const cleaned = baseUrl?.trim().replace(/\/+$/, "") ?? "";
  if (!cleaned) {
    throw new Error(
      "cms0: apiConfig.baseUrl is required to consume API resources.",
    );
  }
  return cleaned;
}

function resolveIncludeIdMode(
  includeId: boolean | undefined,
  globalIncludeId: boolean | undefined,
): IncludeIdMode {
  const enabled = includeId ?? globalIncludeId ?? false;
  return enabled ? "all" : "none";
}

function shouldIncludeObjectId(
  mode: IncludeIdMode,
  _isCollectionItem: boolean,
) {
  return mode === "all";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function appendQueryValue(
  params: URLSearchParams,
  key: string,
  rawValue: unknown,
) {
  if (rawValue === undefined || rawValue === null) return;

  if (Array.isArray(rawValue)) {
    const values = rawValue.filter(
      (value) => value !== undefined && value !== null,
    );
    if (values.length === 0) return;

    if (
      key.endsWith(".fields") ||
      key.endsWith(".exclude") ||
      key === "fields" ||
      key === "exclude"
    ) {
      params.set(key, values.map(String).join(","));
      return;
    }

    values.forEach((value) => params.append(key, String(value)));
    return;
  }

  params.set(key, String(rawValue));
}

function buildSearchParams(
  query: CmsQuery | undefined,
  graph: GraphQueryOptions | undefined,
) {
  const params = new URLSearchParams();

  if (query) {
    for (const [key, rawValue] of Object.entries(query)) {
      appendQueryValue(params, key, rawValue);
    }
  }

  const graphParams = serializeGraphQueryOptions(graph);
  graphParams.forEach((value, key) => params.set(key, value));

  return params;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = cloneValue(child);
    }
    return out as T;
  }
  return value;
}

function normalizeProjectionPaths(
  input: string | string[] | undefined,
): string[][] {
  if (!input) return [];
  const values = Array.isArray(input) ? input : [input];
  const unique = new Set<string>();

  for (const raw of values) {
    for (const candidate of raw.split(",")) {
      const path = candidate.trim();
      if (!path) continue;
      const normalized = path
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean)
        .join(".");
      if (!normalized) continue;
      unique.add(normalized);
    }
  }

  return Array.from(unique).map((path) => path.split("."));
}

function isProjectionPathPrefix(
  prefix: readonly string[],
  value: readonly string[],
): boolean {
  if (prefix.length > value.length) return false;
  return prefix.every((token, index) => value[index] === token);
}

function shouldTraverseProjectionPath(
  childTokens: readonly string[],
  includePaths: readonly string[][],
  excludePaths: readonly string[][],
): boolean {
  if (
    includePaths.length > 0 &&
    !includePaths.some(
      (pathTokens) =>
        isProjectionPathPrefix(pathTokens, childTokens) ||
        isProjectionPathPrefix(childTokens, pathTokens),
    )
  ) {
    return false;
  }

  if (
    excludePaths.some((pathTokens) =>
      isProjectionPathPrefix(pathTokens, childTokens),
    )
  ) {
    return false;
  }

  return true;
}

function mergeProjectedValue(existing: unknown, incoming: unknown): unknown {
  if (incoming === undefined) return existing;
  if (existing === undefined) return cloneValue(incoming);

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const max = Math.max(existing.length, incoming.length);
    const out: unknown[] = [];
    for (let index = 0; index < max; index++) {
      const next = mergeProjectedValue(existing[index], incoming[index]);
      if (next !== undefined) out.push(next);
    }
    return out;
  }

  if (isPlainObject(existing) && isPlainObject(incoming)) {
    const out: Record<string, unknown> = { ...existing };
    for (const [key, child] of Object.entries(incoming)) {
      out[key] = mergeProjectedValue(out[key], child);
    }
    return out;
  }

  return cloneValue(incoming);
}

function projectValueByPath(value: unknown, tokens: string[]): unknown {
  if (!tokens.length) return cloneValue(value);

  if (Array.isArray(value)) {
    const projectedItems = value
      .map((item) => projectValueByPath(item, tokens))
      .filter((item) => item !== undefined);
    return projectedItems.length ? projectedItems : undefined;
  }

  if (!isPlainObject(value)) return undefined;

  const [head, ...rest] = tokens;
  if (!head || !(head in value)) return undefined;

  const child = projectValueByPath(value[head], rest);
  if (child === undefined) return undefined;

  return { [head]: child };
}

function excludeValueByPath(value: unknown, tokens: string[]): unknown {
  if (!tokens.length) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => excludeValueByPath(item, tokens));
  }

  if (!isPlainObject(value)) return value;

  const [head, ...rest] = tokens;
  if (!head || !(head in value)) return cloneValue(value);

  const out: Record<string, unknown> = { ...value };
  if (!rest.length) {
    delete out[head];
    return out;
  }

  const next = excludeValueByPath(out[head], rest);
  if (next === undefined) {
    delete out[head];
  } else {
    out[head] = next;
  }
  return out;
}

function applyFieldProjection(
  value: unknown,
  fields: string | string[] | undefined,
  exclude: string | string[] | undefined,
): unknown {
  const includePaths = normalizeProjectionPaths(fields);
  const excludePaths = normalizeProjectionPaths(exclude);

  let projected: unknown = value;

  if (includePaths.length) {
    let included: unknown = undefined;
    for (const pathTokens of includePaths) {
      const partial = projectValueByPath(value, pathTokens);
      included = mergeProjectedValue(included, partial);
    }
    projected =
      included === undefined
        ? Array.isArray(value)
          ? []
          : isPlainObject(value)
            ? {}
            : undefined
        : included;
  }

  if (excludePaths.length) {
    let excluded = projected;
    for (const pathTokens of excludePaths) {
      excluded = excludeValueByPath(excluded, pathTokens);
    }
    projected = excluded;
  }

  return projected;
}

type CmsGraphMutationOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "insert"; path: string; value: unknown }
  | { op: "delete"; path: string };

function escapeGraphPointerToken(token: string | number) {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

function buildGraphPointerPath(path: readonly (string | number)[]) {
  return path.length === 0
    ? "/"
    : `/${path.map((token) => escapeGraphPointerToken(token)).join("/")}`;
}

function buildProjectionPath(path: readonly (string | number)[]) {
  return path
    .filter((token) => typeof token === "string")
    .map((token) => String(token))
    .join(".");
}

function readValueAtPath(value: unknown, path: readonly (string | number)[]) {
  let current = value;
  for (const token of path) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0) return undefined;
      current = current[index];
      continue;
    }

    if (!isPlainObject(current)) return undefined;
    current = current[String(token)];
  }
  return current;
}

function buildSetOpsFromPatch(
  value: unknown,
  path: readonly (string | number)[] = [],
): CmsGraphMutationOp[] {
  if (value === undefined) return [];

  if (Array.isArray(value) || !isPlainObject(value)) {
    return [{ op: "set", path: buildGraphPointerPath(path), value }];
  }

  const entries = Object.entries(value).filter(
    ([, child]) => child !== undefined,
  );
  if (!entries.length) {
    return path.length
      ? [{ op: "set", path: buildGraphPointerPath(path), value }]
      : [];
  }

  return entries.flatMap(([key, child]) =>
    buildSetOpsFromPatch(child, [...path, key]),
  );
}

function getModelObjectDescriptor(
  descriptor: FullDescriptor,
  modelName: string,
): FieldDescriptor | undefined {
  const model = descriptor.models?.[modelName];
  if (!model) return undefined;
  return asModelObjectDescriptor(modelName, descriptor);
}

function getDescriptorChild(
  descriptor: FullDescriptor,
  field: FieldDescriptor | undefined,
  key: string,
): FieldDescriptor | undefined {
  if (!field) return undefined;

  if (isModelRefDescriptor(field)) {
    const model = getModelObjectDescriptor(descriptor, field.model);
    return getDescriptorChild(descriptor, model, key);
  }

  if (isArrayDescriptor(field)) {
    return getDescriptorChild(descriptor, field.items, key);
  }

  if (isObjectDescriptor(field)) {
    return field.properties[key];
  }

  return undefined;
}

async function requestJson(
  baseUrl: string,
  apiKey: string | undefined,
  path: string,
  options?: {
    query?: CmsQuery;
    graph?: GraphQueryOptions;
    signal?: AbortSignal;
  },
): Promise<any> {
  const params = buildSearchParams(options?.query, options?.graph);
  const url = `${baseUrl}/${path}${params.toString() ? `?${params.toString()}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    signal: options?.signal,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed for '${path}' with status ${response.status}: ${response.statusText}`,
    );
  }
  return response.json();
}

async function request(
  baseUrl: string,
  apiKey: string | undefined,
  method: string,
  path: string,
  body?: unknown,
  options?: {
    query?: CmsQuery;
    graph?: GraphQueryOptions;
    signal?: AbortSignal;
  },
): Promise<any> {
  const params = buildSearchParams(options?.query, options?.graph);
  const url = `${baseUrl}/${path}${params.toString() ? `?${params.toString()}` : ""}`;

  const headers: Record<string, string> = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    signal: options?.signal,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new Error(
      `Request failed for '${path}' with status ${response.status}: ${response.statusText}`,
    );
  }

  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function validateResult(
  resource: ResourceEntry,
  result: unknown,
  descriptor: FullDescriptor,
  includeIdMode: IncludeIdMode,
  zodSchemas: Record<string, any>,
  modelZodSchemas: Record<string, any>,
) {
  if (includeIdMode === "all") return;

  if (resource.kind === "root") {
    const schema = zodSchemas[resource.key];
    if (!schema) return;
    const parsed = schema.safeParse(result);
    if (!parsed.success) {
      throw new Error(formatValidationError(resource.key, parsed.error));
    }
    return;
  }

  const modelName = resource.modelName;
  if (!modelName) return;
  const modelSchema = modelZodSchemas[modelName];
  if (!modelSchema) return;

  if (Array.isArray(result)) {
    const parsed = modelSchema.array().safeParse(result);
    if (!parsed.success) {
      throw new Error(formatValidationError(modelName, parsed.error));
    }
    return;
  }

  if (result === null || result === undefined) return;
  const parsed = modelSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error(formatValidationError(modelName, parsed.error));
  }
}

function attachResourceProvenance<T>(resource: ResourceEntry, value: T): T {
  return attachResourceProvenanceWithOptions(resource, value);
}

function attachResourceProvenanceWithOptions<T>(
  resource: ResourceEntry,
  value: T,
  options?: {
    registerLiveRoot?: boolean;
  },
): T {
  if (value === null || value === undefined) return value;
  enableCms0ProvenanceTracking(true);
  const rootId =
    resource.kind === "root"
      ? resource.key
      : (resource.modelName ?? resource.key);
  return attachCms0ProvenanceRoot(value, rootId, options);
}

async function runResource(
  resource: ResourceEntry,
  descriptor: FullDescriptor,
  baseUrl: string,
  apiKey: string | undefined,
  defaultLocale: string | undefined,
  assetUrlBuilder: AssetUrlBuilder,
  zodSchemas: Record<string, any>,
  modelZodSchemas: Record<string, any>,
  globalIncludeId: boolean,
  sharedModelInflightCache: Map<string, Promise<any>>,
  options?: CmsAccessorOptions,
  byId?: string,
  provenanceOptions?: {
    registerLiveRoot?: boolean;
  },
) {
  const responseMode = options?.response ?? "normalized";
  const includeIdMode = resolveIncludeIdMode(
    options?.includeId,
    globalIncludeId,
  );
  const resolveModelRefs = options?.graph?.resolveModelRefs !== false;
  const includeProjectionPaths = normalizeProjectionPaths(options?.fields);
  const excludeProjectionPaths = normalizeProjectionPaths(options?.exclude);
  const shouldValidateFullResult =
    includeProjectionPaths.length === 0 && excludeProjectionPaths.length === 0;
  const requestedLocale =
    options?.locale ??
    (typeof options?.query?.locale === "string"
      ? options.query.locale
      : undefined);
  const locale =
    requestedLocale ?? (responseMode === "normalized" ? "all" : undefined);

  const query: CmsQuery = {
    ...(options?.query ?? {}),
  };
  const graphQuery: GraphQueryOptions = {
    ...(options?.graph as GraphQueryOptions | undefined),
  };

  if (options?.fields !== undefined && graphQuery.fields === undefined) {
    graphQuery.fields = Array.isArray(options.fields)
      ? options.fields.join(",")
      : options.fields;
  }
  if (options?.exclude !== undefined && graphQuery.exclude === undefined) {
    graphQuery.exclude = Array.isArray(options.exclude)
      ? options.exclude.join(",")
      : options.exclude;
  }

  const shouldNormalize = responseMode !== "raw";
  if (shouldNormalize && query.raw === undefined) {
    query.raw = 1;
  }
  if (locale && graphQuery.locale === undefined) {
    graphQuery.locale = locale;
  }

  const shouldDefaultGraphResolution =
    shouldNormalize &&
    resolveModelRefs;

  if (
    shouldDefaultGraphResolution &&
    graphQuery.resolveModelRefs === undefined
  ) {
    graphQuery.resolveModelRefs = true;
  }

  const shouldDefaultFullRootPageSize =
    shouldDefaultGraphResolution &&
    !byId &&
    resource.kind === "root" &&
    !resource.isCollection &&
    isObjectDescriptor(resource.descriptor);

  if (shouldDefaultFullRootPageSize && graphQuery.pageSize === undefined) {
    graphQuery.pageSize = "full";
  }

  const normalizePath = byId
    ? `${resource.path}/${encodeURIComponent(byId)}`
    : resource.path;
  const requestPath = buildGraphReadPath(resource.path, byId);
  const rawData = await requestJson(baseUrl, apiKey, requestPath, {
    query,
    graph: graphQuery,
    signal: options?.signal,
  });

  if (!shouldNormalize) {
    return applyFieldProjection(rawData, options?.fields, options?.exclude);
  }

  const modelDescriptors = new Map<string, FieldDescriptor>();
  for (const modelName of Object.keys(descriptor.models ?? {})) {
    modelDescriptors.set(
      modelName,
      asModelObjectDescriptor(modelName, descriptor),
    );
  }

  const context: RequestContext = {
    requestJson: (path, requestOptions) =>
      requestJson(baseUrl, apiKey, path, {
        ...requestOptions,
        signal: options?.signal,
      }),
    modelDescriptors,
    modelCache: new Map<string, Promise<any>>(),
    sharedModelInflightCache,
    canvasModelRefCollectionIdentityCache:
      shouldNormalize && isCms0CanvasTransportEnabled()
        ? new Map<string, Promise<CanvasModelRefCollectionIdentity[] | null>>()
        : undefined,
    options: {
      includeIdMode,
      resolveModelRefs,
      locale,
      defaultLocale,
      assetUrlBuilder,
      modelNormalizationConcurrency: DEFAULT_MODEL_NORMALIZATION_CONCURRENCY,
      includeProjectionPaths,
      excludeProjectionPaths,
    },
  };

  if (resource.isCollection && !byId) {
    const envelope = ensureCollectionEnvelope(rawData, resource.path);
    const descriptorForCollection =
      resource.kind === "root" && isArrayDescriptor(resource.descriptor)
        ? resource.descriptor
        : ({
            type: "array",
            items: resource.descriptor,
            optional: false,
            nullable: false,
          } as FieldDescriptor);

    const normalizedItems = await normalizeArrayField(
      descriptorForCollection as Extract<FieldDescriptor, { type: "array" }>,
      resource.path,
      envelope,
      context,
      new Set<string>(),
    );

    if (responseMode === "envelope") {
      const projectedItems = applyFieldProjection(
        normalizedItems,
        options?.fields,
        options?.exclude,
      );
      if (shouldValidateFullResult) {
        validateResult(
          resource,
          normalizedItems,
          descriptor,
          includeIdMode,
          zodSchemas,
          modelZodSchemas,
        );
      }
      return {
        items: attachResourceProvenanceWithOptions(
          resource,
          Array.isArray(projectedItems) ? projectedItems : normalizedItems,
          provenanceOptions,
        ),
        total: envelope.total,
      };
    }

    if (shouldValidateFullResult) {
      validateResult(
        resource,
        normalizedItems,
        descriptor,
        includeIdMode,
        zodSchemas,
        modelZodSchemas,
      );
    }
    return attachResourceProvenanceWithOptions(
      resource,
      normalizedItems,
      provenanceOptions,
    );
  }

  const normalized = await normalizeField(
    resource.descriptor,
    normalizePath,
    rawData,
    context,
    new Set<string>(),
    false,
  );

  if (shouldValidateFullResult) {
    validateResult(
      resource,
      normalized,
      descriptor,
      includeIdMode,
      zodSchemas,
      modelZodSchemas,
    );
  }
  return attachResourceProvenanceWithOptions(
    resource,
    applyFieldProjection(normalized, options?.fields, options?.exclude),
    provenanceOptions,
  );
}

type ConcreteGraphAccessorInput = {
  apiKey: string | undefined;
  assetUrlBuilder: AssetUrlBuilder;
  baseUrl: string;
  defaultLocale: string | undefined;
  descriptor: FullDescriptor;
  entry: ResourceEntry;
  globalIncludeId: boolean;
  modelZodSchemas: Record<string, any>;
  sharedModelInflightCache: Map<string, Promise<any>>;
  zodSchemas: Record<string, any>;
};

function createConcreteGraphAccessor(
  input: ConcreteGraphAccessorInput,
  path: readonly (string | number)[] = [],
  fieldDescriptor: FieldDescriptor | undefined = input.entry.descriptor,
): CmsFieldAccessor<any, boolean> {
  const read = async (options?: CmsAccessorOptions) => {
    const projectionPath = buildProjectionPath(path);
    const value = await runResource(
      input.entry,
      input.descriptor,
      input.baseUrl,
      input.apiKey,
      input.defaultLocale,
      input.assetUrlBuilder,
      input.zodSchemas,
      input.modelZodSchemas,
      input.globalIncludeId,
      input.sharedModelInflightCache,
      projectionPath
        ? {
            ...options,
            fields:
              options?.fields === undefined ? projectionPath : options.fields,
          }
        : options,
    );

    return projectionPath ? readValueAtPath(value, path) : value;
  };

  const mutate = async (ops: CmsGraphMutationOp[]) => {
    if (!ops.length) return;
    await request(
      input.baseUrl,
      input.apiKey,
      "POST",
      `_graph/${input.entry.path}/_mutate`,
      { ops },
    );
  };

  const update = async (value: unknown) => {
    await mutate(buildSetOpsFromPatch(value, path));
  };

  const set = async (value: unknown) => {
    await mutate([{ op: "set", path: buildGraphPointerPath(path), value }]);
  };

  const fieldFn = read as CmsFieldAccessor<any, boolean>;

  return new Proxy(fieldFn, {
    get(target, property: string | symbol, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      if (property === "then") return undefined;
      if (property === "update") return update;
      if (property === "set") return set;
      if (property === "delete") {
        return async () => {
          await mutate([{ op: "delete", path: buildGraphPointerPath(path) }]);
        };
      }
      if (property === "append") {
        return async (value: unknown) => {
          await mutate([
            {
              op: "insert",
              path: buildGraphPointerPath([...path, "-"]),
              value,
            },
          ]);
        };
      }
      if (property === "insert") {
        return async (index: number, value: unknown) => {
          await mutate([
            {
              op: "insert",
              path: buildGraphPointerPath([...path, index]),
              value,
            },
          ]);
        };
      }
      if (property === "at") {
        return (index: number) =>
          createConcreteGraphAccessor(
            input,
            [...path, index],
            isArrayDescriptor(fieldDescriptor)
              ? fieldDescriptor.items
              : fieldDescriptor,
          );
      }
      if (property === "where") {
        return async (clause: WhereClause<any>, options?: CmsAccessorOptions) => {
          const graphPath = path.length
            ? `${input.entry.path}/${path.join("/")}`
            : input.entry.path;
          const body: Record<string, unknown> = {
            filter: clause as GraphFilterClause,
          };
          if (options?.fields) body.fields = options.fields;
          if (options?.exclude) body.exclude = options.exclude;
          if (options?.locale) body.locale = options.locale;
          if (options?.graph?.page !== undefined) body.page = options.graph.page;
          if (options?.graph?.pageSize !== undefined) body.pageSize = options.graph.pageSize;
          if (options?.graph?.orderBy) body.orderBy = options.graph.orderBy;
          if (options?.graph?.orderDir) body.orderDir = options.graph.orderDir;
          if (options?.graph?.search) body.search = options.graph.search;
          if (options?.graph?.paths) body.paths = options.graph.paths;

          const response = await request(
            input.baseUrl,
            input.apiKey,
            "POST",
            `_graph/${graphPath}/_query`,
            body,
            { signal: options?.signal },
          );

          if (options?.response === "envelope") {
            return response;
          }

          if (response && typeof response === "object" && "data" in response) {
            return response.data;
          }
          if (response && typeof response === "object" && "items" in response) {
            return response.items;
          }
          if (Array.isArray(response)) {
            return response;
          }
          return response;
        };
      }
      if (property === "whereFirst") {
        return async (clause: WhereClause<any>, options?: CmsAccessorOptions) => {
          const graphPath = path.length
            ? `${input.entry.path}/${path.join("/")}`
            : input.entry.path;
          const body: Record<string, unknown> = {
            filter: clause as GraphFilterClause,
            pageSize: 1,
          };
          if (options?.fields) body.fields = options.fields;
          if (options?.exclude) body.exclude = options.exclude;
          if (options?.locale) body.locale = options.locale;
          if (options?.graph?.page !== undefined) body.page = options.graph.page;
          if (options?.graph?.orderBy) body.orderBy = options.graph.orderBy;
          if (options?.graph?.orderDir) body.orderDir = options.graph.orderDir;
          if (options?.graph?.search) body.search = options.graph.search;
          if (options?.graph?.paths) body.paths = options.graph.paths;

          const response = await request(
            input.baseUrl,
            input.apiKey,
            "POST",
            `_graph/${graphPath}/_query`,
            body,
            { signal: options?.signal },
          );

          const items =
            response && typeof response === "object" && "data" in response
              ? (response as any).data
              : response && typeof response === "object" && "items" in response
                ? (response as any).items
                : Array.isArray(response)
                  ? response
                  : [];
          return items[0] ?? null;
        };
      }

      const childDescriptor = getDescriptorChild(
        input.descriptor,
        fieldDescriptor,
        property,
      );
      if (childDescriptor) {
        return createConcreteGraphAccessor(
          input,
          [...path, property],
          childDescriptor,
        );
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

export function createCmsClient<
  Roots,
  Models extends Record<string, any> = Record<string, never>,
>(
  descriptor: FullDescriptor,
  config: Cms0Options & { includeId: true },
): CmsInstance<Roots, Models, true>;
export function createCmsClient<
  Roots,
  Models extends Record<string, any> = Record<string, never>,
>(
  descriptor: FullDescriptor,
  config: Cms0Options & { includeId?: false | undefined },
): CmsInstance<Roots, Models, false>;
export function createCmsClient<
  Roots,
  Models extends Record<string, any> = Record<string, never>,
>(
  descriptor: FullDescriptor,
  config: Cms0Options,
): CmsInstance<Roots, Models, boolean>;
export function createCmsClient<
  Roots,
  Models extends Record<string, any> = Record<string, never>,
>(
  descriptor: FullDescriptor,
  config: Cms0Options,
): CmsInstance<Roots, Models, boolean> {
  const baseUrl = normalizeBaseUrl(config.apiConfig?.baseUrl);
  const apiKey = config.apiConfig?.key;
  const assetUrlBuilder = buildAssetUrlBuilder(baseUrl, config.assets);
  const registry = createResourceRegistry(descriptor);
  const rootKeys = Array.from(registry.roots.keys());
  const modelKeys = Array.from(registry.models.keys());
  const { zodSchemas, modelZodSchemas } =
    buildZodSchemasFromDescriptor(descriptor);
  const globalIncludeId = !!config.includeId;
  const sharedModelInflightCache = new Map<string, Promise<any>>();

  const buildModelAccessor = (
    entry: ResourceEntry,
  ): CmsModelAccessor<any, boolean> => {
    const accessor = (async (options?: CmsAccessorOptions) =>
      runResource(
        entry,
        descriptor,
        baseUrl,
        apiKey,
        config.defaultLocale,
        assetUrlBuilder,
        zodSchemas,
        modelZodSchemas,
        globalIncludeId,
        sharedModelInflightCache,
        options,
      )) as CmsModelAccessor<any, boolean>;

    accessor.byId = (async (id: string, options?: CmsAccessorOptions) =>
      runResource(
        entry,
        descriptor,
        baseUrl,
        apiKey,
        config.defaultLocale,
        assetUrlBuilder,
        zodSchemas,
        modelZodSchemas,
        globalIncludeId,
        sharedModelInflightCache,
        options,
        id,
      )) as CmsModelByIdAccessor<any, boolean>;

    accessor.list = async (options?: CmsAccessorOptions) =>
      (accessor as any)(options);

    accessor.get = async (id: string, options?: CmsAccessorOptions) =>
      (accessor as any).byId(id, options);

    accessor.create = async (value: any) => {
      const response = await request(
        baseUrl,
        apiKey,
        "POST",
        entry.path,
        value,
      );
      return response;
    };

    accessor.update = async (id: string, value: any) => {
      const response = await request(
        baseUrl,
        apiKey,
        "POST",
        `_graph/${entry.path}/${encodeURIComponent(id)}/_mutate`,
        { ops: buildSetOpsFromPatch(value) },
      );
      return response;
    };

    accessor.delete = async (id: string) => {
      await request(
        baseUrl,
        apiKey,
        "DELETE",
        `${entry.path}?id=${encodeURIComponent(id)}`,
      );
    };

    accessor.where = async (
      clause: WhereClause<any>,
      options?: CmsAccessorOptions,
    ) => {
      const body: Record<string, unknown> = {
        filter: clause as GraphFilterClause,
      };
      if (options?.fields) body.fields = options.fields;
      if (options?.exclude) body.exclude = options.exclude;
      if (options?.locale) body.locale = options.locale;
      if (options?.graph?.page !== undefined) body.page = options.graph.page;
      if (options?.graph?.pageSize !== undefined) body.pageSize = options.graph.pageSize;
      if (options?.graph?.orderBy) body.orderBy = options.graph.orderBy;
      if (options?.graph?.orderDir) body.orderDir = options.graph.orderDir;
      if (options?.graph?.search) body.search = options.graph.search;
      if (options?.graph?.paths) body.paths = options.graph.paths;

      const response = await request(
        baseUrl,
        apiKey,
        "POST",
        `_graph/${entry.path}/_query`,
        body,
        { signal: options?.signal },
      );

      if (options?.response === "envelope") {
        return response;
      }

      if (response && typeof response === "object" && "data" in response) {
        return response.data;
      }
      if (response && typeof response === "object" && "items" in response) {
        return response.items;
      }
      if (Array.isArray(response)) {
        return response;
      }
      return response;
    };

    accessor.whereFirst = async (
      clause: WhereClause<any>,
      options?: CmsAccessorOptions,
    ) => {
      const results = await accessor.where(clause, {
        ...options,
        graph: { ...options?.graph, pageSize: 1 },
      });
      const items = Array.isArray(results) ? results : [];
      return items[0] ?? null;
    };

    return accessor;
  };

  const modelsProxy = new Proxy(
    {},
    {
      get(_target, property: string | symbol) {
        if (typeof property !== "string") return undefined;
        if (property === "then") return undefined;
        const modelEntry =
          registry.models.get(property) ??
          registry.modelsCaseInsensitive.get(property.toLowerCase());
        if (!modelEntry) {
          unknownKeyError(property, [], modelKeys);
        }
        return buildModelAccessor(modelEntry);
      },
    },
  );

  const clientMeta: CmsMeta<boolean> = {
    locales: config.locales ?? [],
    defaultLocale: config.defaultLocale,
    includeIdDefault: !!config.includeId,
  };
  const readRoot = async (
    rootId: string,
    options?: {
      apiKey?: string;
      locale?: string;
      includeId?: boolean;
    },
  ) => {
    const entry =
      registry.roots.get(rootId) ??
      registry.rootsCaseInsensitive.get(rootId.toLowerCase());
    if (!entry) {
      throw new Error(`cms0: unknown root '${rootId}' for Canvas read-back.`);
    }

    return runResource(
      entry,
      descriptor,
      baseUrl,
      options?.apiKey ?? apiKey,
      config.defaultLocale,
      assetUrlBuilder,
      zodSchemas,
      modelZodSchemas,
      globalIncludeId,
      sharedModelInflightCache,
      {
        includeId: options?.includeId ?? true,
        locale: options?.locale ?? "all",
      },
      undefined,
      {
        registerLiveRoot: false,
      },
    );
  };
  globalThis.__CMS0_CANVAS_CLIENT__ = {
    apiBaseUrl: baseUrl,
    locales: clientMeta.locales,
    defaultLocale: clientMeta.defaultLocale,
    publishTriggerId:
      typeof config.canvas?.publishTriggerId === "string" &&
      config.canvas.publishTriggerId.trim().length > 0
        ? config.canvas.publishTriggerId.trim()
        : undefined,
    readRoot,
  };
  const rootProxyTarget: Record<string, unknown> = {
    models: modelsProxy,
    meta: clientMeta,
  };

  const rootProxy = new Proxy(rootProxyTarget, {
    get(target, property: string | symbol, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }
      if (property === "then") return undefined;
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      const entry =
        registry.roots.get(property) ??
        registry.rootsCaseInsensitive.get(property.toLowerCase());
      if (!entry) {
        unknownKeyError(property, rootKeys, []);
      }

      return createConcreteGraphAccessor({
        apiKey,
        assetUrlBuilder,
        baseUrl,
        defaultLocale: config.defaultLocale,
        descriptor,
        entry,
        globalIncludeId,
        modelZodSchemas,
        sharedModelInflightCache,
        zodSchemas,
      });
    },
  });

  return rootProxy as CmsInstance<Roots, Models, boolean>;
}

/**
 * Initializes the CMS SDK for a given schema.
 * @param config configuration including API base URL and API key.
 * @returns typed accessors for root resources and model resources.
 */
export function cms0<
  Roots = GeneratedRoots,
  Models extends Record<string, any> = GeneratedModels,
>(config: Cms0Options & { includeId: true }): CmsInstance<Roots, Models, true>;
export function cms0<
  Roots = GeneratedRoots,
  Models extends Record<string, any> = GeneratedModels,
>(
  config: Cms0Options & { includeId?: false | undefined },
): CmsInstance<Roots, Models, false>;
export function cms0<
  Roots = GeneratedRoots,
  Models extends Record<string, any> = GeneratedModels,
>(config: Cms0Options): CmsInstance<Roots, Models, boolean>;
export function cms0<
  Roots = GeneratedRoots,
  Models extends Record<string, any> = GeneratedModels,
>(config: Cms0Options): CmsInstance<Roots, Models, boolean> {
  if (typeof window !== "undefined") {
    return createLazyBrowserCmsClient<Roots, Models>(config);
  }
  return createCmsClient<Roots, Models>(getActiveSchemaDescriptor(), config);
}

function createLazyBrowserCmsClient<
  Roots,
  Models extends Record<string, any> = Record<string, never>,
>(config: Cms0Options): CmsInstance<Roots, Models, boolean> {
  let clientPromise: Promise<CmsInstance<Roots, Models, boolean>> | null = null;
  const invalidateClientCache = () => {
    clientPromise = null;
    invalidateBrowserSchemaDescriptorCache(
      config.apiConfig?.baseUrl,
      config.apiConfig?.key,
    );
  };

  const handleDescriptorInvalidation = () => {
    clientPromise = null;
  };

  const resolveClient = async () => {
    ensureBrowserSchemaDescriptorDevSubscription(
      config.apiConfig?.baseUrl,
      config.apiConfig?.key,
      handleDescriptorInvalidation,
    );

    if (!clientPromise) {
      clientPromise = resolveBrowserSchemaDescriptor(
        config.apiConfig?.baseUrl,
        config.apiConfig?.key,
      ).then((descriptor) =>
        createCmsClient<Roots, Models>(descriptor, config),
      );
    }

    return clientPromise;
  };

  const runBrowserAccessor = async <Value>(
    resolver: (client: CmsInstance<Roots, Models, boolean>) => Promise<Value>,
  ): Promise<Value> => {
    try {
      const client = await resolveClient();
      return await resolver(client);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Unknown schema key '")
      ) {
        invalidateClientCache();
        const client = await resolveClient();
        return resolver(client);
      }

      throw error;
    }
  };

  const getNestedAccessor = (
    client: CmsInstance<Roots, Models, boolean>,
    rootProperty: string,
    path: readonly (string | number)[],
  ) => {
    let current = (client as any)[rootProperty];
    for (const token of path) {
      current =
        typeof token === "number" ? current.at(token) : current[String(token)];
    }
    return current;
  };

  const functionMemberNames = new Set([
    "apply",
    "bind",
    "call",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
  ]);

  const buildLazyGraphAccessor = (
    rootProperty: string,
    path: readonly (string | number)[] = [],
  ): CmsFieldAccessor<any, boolean> => {
    const accessor = (async (options?: CmsAccessorOptions) =>
      runBrowserAccessor((client) =>
        getNestedAccessor(client, rootProperty, path)(options),
      )) as CmsFieldAccessor<any, boolean>;

    return new Proxy(accessor, {
      get(target, property: string | symbol, receiver) {
        if (typeof property !== "string") {
          return Reflect.get(target, property, receiver);
        }

        if (property === "then") return undefined;
        if (functionMemberNames.has(property)) {
          return Reflect.get(target, property, receiver);
        }
        if (property === "update" || property === "set" || property === "delete") {
          return (...args: unknown[]) =>
            runBrowserAccessor((client) =>
              getNestedAccessor(client, rootProperty, path)[property](...args),
            );
        }
        if (property === "append" || property === "insert") {
          return (...args: unknown[]) =>
            runBrowserAccessor((client) =>
              getNestedAccessor(client, rootProperty, path)[property](...args),
            );
        }
        if (property === "at") {
          return (index: number) =>
            buildLazyGraphAccessor(rootProperty, [...path, index]);
        }

        return buildLazyGraphAccessor(rootProperty, [...path, property]);
      },
    });
  };

  const buildModelAccessor = (property: string) => {
    const accessor = (async (options?: CmsAccessorOptions) => {
      return runBrowserAccessor((client) =>
        (client.models as any)[property](options),
      );
    }) as unknown as CmsModelAccessor<any, boolean>;

    accessor.byId = async (id: string, options?: CmsAccessorOptions) => {
      return runBrowserAccessor((client) =>
        (client.models as any)[property].byId(id, options),
      );
    };

    accessor.list = async (options?: CmsAccessorOptions) => {
      return runBrowserAccessor((client) =>
        (client.models as any)[property].list(options),
      );
    };

    accessor.get = async (id: string, options?: CmsAccessorOptions) => {
      return runBrowserAccessor((client) =>
        (client.models as any)[property].get(id, options),
      );
    };

    accessor.create = async (value: any) => {
      return runBrowserAccessor((client) =>
        (client.models as any)[property].create(value),
      );
    };

    accessor.update = async (id: string, value: any) => {
      return runBrowserAccessor((client) =>
        (client.models as any)[property].update(id, value),
      );
    };

    accessor.delete = async (id: string) => {
      return runBrowserAccessor((client) =>
        (client.models as any)[property].delete(id),
      );
    };

    return accessor;
  };

  const modelsProxy = new Proxy(
    {},
    {
      get(_target, property: string | symbol) {
        if (typeof property !== "string") return undefined;
        if (property === "then") return undefined;
        return buildModelAccessor(property);
      },
    },
  );

  const clientMeta: CmsMeta<boolean> = {
    locales: config.locales ?? [],
    defaultLocale: config.defaultLocale,
    includeIdDefault: !!config.includeId,
  };

  const rootProxyTarget: Record<string, unknown> = {
    models: modelsProxy,
    meta: clientMeta,
  };

  const rootProxy = new Proxy(rootProxyTarget, {
    get(target, property: string | symbol, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }
      if (property === "then") return undefined;
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      return buildLazyGraphAccessor(property);
    },
  });

  return rootProxy as CmsInstance<Roots, Models, boolean>;
}

export {
  activateCms0CanvasTransport,
  attachCms0ProvenanceRoot,
  captureCms0Provenance,
  dehydrateCms0CanvasTransportValue,
  dehydrateCms0CanvasVisibleValue,
  enableCms0ProvenanceTracking,
  readCms0CanvasTransportCollectionItemId,
  readCms0CollectionItemIdentity,
  registerCms0LiveRoot,
  registerCms0CollectionItemIdentity,
  readCms0LiveRoots,
  readCms0ProvenanceValueMeta,
  restoreCms0CanvasTransportMetadata,
  unwrapCms0CanvasTransportValue,
} from "./provenance.js";
export type {
  Cms0LiveRoot,
  Cms0ProvenanceCapture,
  Cms0ProvenanceConfidence,
  Cms0ProvenanceMapping,
  Cms0ProvenanceValueMeta,
} from "./provenance.js";
export {
  resolveLocalized,
  toNextMetadata,
  toOpenGraph,
  toTwitter,
} from "./seo.js";
export type { ResolveLocalizedOptions, ToNextMetadataOptions } from "./seo.js";
export type {
  WhereClause,
  StringFilterOp,
  NumberFilterOp,
  BooleanFilterOp,
  FilterOp,
  GraphFilterClause,
} from "@cms0/shared";
