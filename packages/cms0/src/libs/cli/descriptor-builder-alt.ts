// Fresh descriptor builder using tree-based traversal from cms0<T>.
import fs from "fs";
import path from "path";
import {
  InterfaceDeclaration,
  Project,
  SourceFile,
  SyntaxKind,
  Type,
  TypeAliasDeclaration,
  CallExpression,
  Node,
} from "ts-morph";
import {
  computeUnionBranchKeys,
  FieldDescriptor,
  FullDescriptor,
  ModelDescriptor,
  RootDescriptor,
} from "@cms0/shared";
import { ResolvedConfig } from "./types.js";
import { findTsConfig } from "./config-loader.js";
import {
  customTypeDescriptors,
  customTypeNames,
  customInlineDescriptors,
  customInlineTypeNames,
  customModelDescriptors,
  customModelTypeNames,
  resolveCustomTypeDependencies,
} from "../../custom-types/registry.js";

type DescriptorWarnings = Set<string>;

function resolveCustomTypeName(type: Type): string | undefined {
  const aliasSymbol = type.getAliasSymbol();
  const symbol = type.getSymbol();
  const name = aliasSymbol?.getName() ?? symbol?.getName();
  if (name && customTypeNames.has(name)) {
    return name;
  }

  const text = type.getText();
  for (const customName of customTypeNames) {
    if (text === customName || text.endsWith(`.${customName}`)) {
      return customName;
    }
  }

  return undefined;
}

function unwrapOptional(type: Type): {
  base: Type;
  optional: boolean;
  nullable: boolean;
} {
  let optional = false;
  let nullable = false;
  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes();
    const filtered = unionTypes.filter((t) => {
      if (t.isNull()) {
        nullable = true;
        return false;
      }
      if (t.isUndefined()) {
        optional = true;
        return false;
      }
      return true;
    });
    if (filtered.length === 1) {
      return { base: filtered[0]!, optional, nullable };
    }
  }
  return { base: type, optional, nullable };
}

function applyOptionalityToDescriptor(
  desc: FieldDescriptor,
  optional: boolean,
  nullable: boolean,
) {
  const clone = JSON.parse(JSON.stringify(desc)) as FieldDescriptor;
  if (optional) (clone as any).optional = true;
  if (nullable) (clone as any).nullable = true;
  return clone;
}

function collectModelNames(sourceFiles: SourceFile[]): Set<string> {
  const names = new Set<string>();
  sourceFiles.forEach((sf) => {
    sf.getTypeAliases().forEach((alias: TypeAliasDeclaration) => {
      if (!alias.hasExportKeyword() && !alias.isDefaultExport()) return;
      if (alias.getType().isObject()) names.add(alias.getName());
    });
    sf.getInterfaces().forEach((iface: InterfaceDeclaration) => {
      if (!iface.hasExportKeyword() && !iface.isDefaultExport()) return;
      if (iface.getType().isObject()) names.add(iface.getName());
    });
  });
  return names;
}

function isDescriptorSourceFile(filePath: string): boolean {
  if (filePath.includes("node_modules")) return false;
  if (filePath.endsWith(".d.ts")) return false;
  return true;
}

function collectTypeSourceFiles(
  type: Type,
  sourceFiles: Map<string, SourceFile>,
  visited: Set<string>,
) {
  const { base } = unwrapOptional(type);
  const aliasSymbol = base.getAliasSymbol();
  const symbol = base.getSymbol();
  const key = `${aliasSymbol?.getName() ?? symbol?.getName() ?? "<anon>"}:${base.getText()}`;
  if (visited.has(key)) return;
  visited.add(key);

  if (base.isUnion()) {
    base
      .getUnionTypes()
      .forEach((entry) => collectTypeSourceFiles(entry, sourceFiles, visited));
    return;
  }

  if (base.isArray()) {
    const elem = base.getArrayElementTypeOrThrow();
    collectTypeSourceFiles(elem, sourceFiles, visited);
    return;
  }

  const customName = resolveCustomTypeName(base);
  if (customName) {
    return;
  }

  const declarations = [
    ...(aliasSymbol?.getDeclarations() ?? []),
    ...(symbol?.getDeclarations() ?? []),
  ];
  declarations.forEach((decl) => {
    const sourceFile = decl.getSourceFile();
    const filePath = path.resolve(sourceFile.getFilePath());
    if (!isDescriptorSourceFile(filePath)) return;
    sourceFiles.set(filePath, sourceFile);
  });

  if (base.isObject()) {
    base.getProperties().forEach((prop) => {
      const decl = prop.getDeclarations()[0];
      if (!decl) return;
      collectTypeSourceFiles(decl.getType(), sourceFiles, visited);
    });
  }
}

function collectRelevantSourceFiles(
  rootType: Type,
  entrySourceFile: SourceFile,
): SourceFile[] {
  const sourceFiles = new Map<string, SourceFile>();
  const entryFilePath = path.resolve(entrySourceFile.getFilePath());
  if (isDescriptorSourceFile(entryFilePath)) {
    sourceFiles.set(entryFilePath, entrySourceFile);
  }
  collectTypeSourceFiles(rootType, sourceFiles, new Set<string>());
  return Array.from(sourceFiles.values());
}

function collectReferencedModelNames(
  type: Type,
  names: Set<string>,
  visited: Set<string>,
  ctx: string,
) {
  const { base } = unwrapOptional(type);
  const key = `${ctx}:${base.getText()}`;
  if (visited.has(key)) return;
  visited.add(key);

  if (base.isUnion()) {
    base
      .getUnionTypes()
      .forEach((t, idx) =>
        collectReferencedModelNames(t, names, visited, `${ctx}|${idx}`),
      );
    return;
  }

  if (base.isArray()) {
    const elem = base.getArrayElementTypeOrThrow();
    collectReferencedModelNames(elem, names, visited, `${ctx}[]`);
    return;
  }

  const aliasSymbol = base.getAliasSymbol();
  const symbol = base.getSymbol();
  const name = aliasSymbol?.getName() ?? symbol?.getName();
  const customName = resolveCustomTypeName(base);
  if (customName) {
    names.add(customName);
  } else if (name && base.isObject()) {
    names.add(name);
  }

  if (base.isObject()) {
    base.getProperties().forEach((prop) => {
      const decl = prop.getDeclarations()[0];
      if (!decl) return;
      collectReferencedModelNames(
        decl.getType(),
        names,
        visited,
        `${ctx}.${prop.getName()}`,
      );
    });
  }
}

function buildProperties(
  type: Type,
  modelNames: Set<string>,
  warnings: DescriptorWarnings,
  ctx: string,
): Record<string, FieldDescriptor> {
  const props: Record<string, FieldDescriptor> = {};
  type.getProperties().forEach((prop) => {
    const decl = prop.getDeclarations()[0];
    if (!decl) return;
    const analyzed = unwrapOptional(decl.getType());
    props[prop.getName()] = descriptorFromType(
      analyzed.base,
      modelNames,
      warnings,
      `${ctx}.${prop.getName()}`,
      {
        optional: prop.isOptional() || analyzed.optional,
        nullable: analyzed.nullable,
      },
    );
  });
  return props;
}

function descriptorFromType(
  type: Type,
  modelNames: Set<string>,
  warnings: DescriptorWarnings,
  ctx: string,
  opts?: { optional?: boolean; nullable?: boolean },
): FieldDescriptor {
  const { base, optional, nullable } = unwrapOptional(type);
  const isOptional = !!opts?.optional || optional;
  const isNullable = !!opts?.nullable || nullable;

  if (base.isUnion()) {
    const unionDescriptor = descriptorFromUnionType(
      base,
      modelNames,
      warnings,
      ctx,
    );
    if (unionDescriptor) {
      return applyOptionalityToDescriptor(
        unionDescriptor,
        isOptional,
        isNullable,
      );
    }
  }

  if (base.isStringLiteral()) {
    return {
      kind: "enum",
      valueType: "string",
      values: [String(base.getLiteralValue())],
      optional: isOptional,
      nullable: isNullable,
    } as FieldDescriptor;
  }

  if (base.isNumberLiteral()) {
    return {
      kind: "enum",
      valueType: "number",
      values: [Number(base.getLiteralValue())],
      optional: isOptional,
      nullable: isNullable,
    } as FieldDescriptor;
  }

  if (base.isBooleanLiteral()) {
    return {
      kind: "enum",
      valueType: "boolean",
      values: [base.getText() === "true"],
      optional: isOptional,
      nullable: isNullable,
    } as FieldDescriptor;
  }

  if (base.isString()) {
    return {
      kind: "primitive",
      type: "string",
      optional: isOptional,
      nullable: isNullable,
    };
  }
  if (base.isNumber()) {
    return {
      kind: "primitive",
      type: "number",
      optional: isOptional,
      nullable: isNullable,
    };
  }
  if (base.isBoolean()) {
    return {
      kind: "primitive",
      type: "boolean",
      optional: isOptional,
      nullable: isNullable,
    };
  }

  const customName = resolveCustomTypeName(base);
  if (customName && customInlineTypeNames.has(customName)) {
    const inlineDescriptor =
      customInlineDescriptors[
        customName as keyof typeof customInlineDescriptors
      ];
    if (inlineDescriptor) {
      return applyOptionalityToDescriptor(
        inlineDescriptor,
        isOptional,
        isNullable,
      );
    }
  }

  if (base.isArray()) {
    const elem = base.getArrayElementTypeOrThrow();
    return {
      type: "array",
      items: descriptorFromType(elem, modelNames, warnings, `${ctx}[]`),
      optional: isOptional,
      nullable: isNullable,
    };
  }

  const aliasSymbol = base.getAliasSymbol();
  const symbol = base.getSymbol();
  const name = aliasSymbol?.getName() ?? symbol?.getName();
  const modelName = customName ?? name;
  if (modelName && modelNames.has(modelName)) {
    return {
      kind: "modelRef",
      model: modelName,
      optional: isOptional,
      nullable: isNullable,
    };
  }

  if (base.isObject()) {
    return {
      type: "object",
      properties: buildProperties(base, modelNames, warnings, ctx),
      optional: isOptional,
      nullable: isNullable,
    };
  }

  warnings.add(`cms0: unsupported type at ${ctx}; falling back to string`);
  return {
    kind: "primitive",
    type: "string",
    optional: isOptional,
    nullable: isNullable,
  };
}

function descriptorFromUnionType(
  unionType: Type,
  modelNames: Set<string>,
  warnings: DescriptorWarnings,
  ctx: string,
): FieldDescriptor | undefined {
  const unionTypes = unionType.getUnionTypes();
  if (!unionTypes.length) return undefined;

  const hasBroadString = unionTypes.some((entry) => entry.isString());
  const hasBroadNumber = unionTypes.some((entry) => entry.isNumber());
  const hasBroadBoolean = unionTypes.some((entry) => entry.isBoolean());

  const filtered = unionTypes.filter((entry) => {
    if (entry.isStringLiteral() && hasBroadString) return false;
    if (entry.isNumberLiteral() && hasBroadNumber) return false;
    if (entry.isBooleanLiteral() && hasBroadBoolean) return false;
    return true;
  });

  if (!filtered.length) {
    if (hasBroadString) {
      return { kind: "primitive", type: "string" } as FieldDescriptor;
    }
    if (hasBroadNumber) {
      return { kind: "primitive", type: "number" } as FieldDescriptor;
    }
    if (hasBroadBoolean) {
      return { kind: "primitive", type: "boolean" } as FieldDescriptor;
    }
    return undefined;
  }

  const literalEnum = resolveLiteralUnionAsEnum(filtered);
  if (literalEnum) {
    return literalEnum;
  }

  const branches = filtered
    .map((entry, index) =>
      descriptorFromType(entry, modelNames, warnings, `${ctx}|${index}`, {
        optional: false,
        nullable: false,
      }),
    )
    .map((entry) => stripOptionality(entry));

  const deduped = dedupeDescriptors(branches);
  if (!deduped.length) return undefined;
  if (deduped.length === 1) return deduped[0];

  const discriminator = inferUnionDiscriminator(deduped);
  const branchKeys = computeUnionBranchKeys(deduped);
  return {
    kind: "union",
    anyOf: deduped,
    branchKeys,
    ...(discriminator ? { discriminator: { key: discriminator } } : {}),
  } as FieldDescriptor;
}

function stripOptionality(descriptor: FieldDescriptor): FieldDescriptor {
  const clone = JSON.parse(JSON.stringify(descriptor)) as FieldDescriptor;
  delete (clone as any).optional;
  delete (clone as any).nullable;
  return clone;
}

function dedupeDescriptors(descriptors: FieldDescriptor[]): FieldDescriptor[] {
  const seen = new Set<string>();
  const deduped: FieldDescriptor[] = [];
  for (const descriptor of descriptors) {
    const key = JSON.stringify(descriptor);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(descriptor);
  }
  return deduped;
}

function resolveLiteralUnionAsEnum(types: Type[]): FieldDescriptor | undefined {
  if (!types.length) return undefined;

  const literals: (string | number | boolean)[] = [];
  let kind: "string" | "number" | "boolean" | undefined;

  for (const entry of types) {
    if (entry.isStringLiteral()) {
      if (kind && kind !== "string") return undefined;
      kind = "string";
      literals.push(String(entry.getLiteralValue()));
      continue;
    }
    if (entry.isNumberLiteral()) {
      if (kind && kind !== "number") return undefined;
      kind = "number";
      literals.push(Number(entry.getLiteralValue()));
      continue;
    }
    if (entry.isBooleanLiteral()) {
      if (kind && kind !== "boolean") return undefined;
      kind = "boolean";
      literals.push(entry.getText() === "true");
      continue;
    }
    return undefined;
  }

  if (!kind) return undefined;
  const unique = Array.from(new Set(literals));
  return {
    kind: "enum",
    valueType: kind,
    values: unique,
  } as FieldDescriptor;
}

function inferUnionDiscriminator(descriptors: FieldDescriptor[]): string | undefined {
  if (
    !descriptors.length ||
    descriptors.some((entry) => (entry as any)?.type !== "object")
  ) {
    return undefined;
  }

  const objects = descriptors as Extract<FieldDescriptor, { type: "object" }>[];
  const sharedKeys = Object.keys(objects[0]?.properties ?? {}).filter((key) =>
    objects.every((obj) => Object.prototype.hasOwnProperty.call(obj.properties ?? {}, key)),
  );

  for (const key of sharedKeys) {
    const enumLikeValues = objects.map((obj) => {
      const prop = (obj.properties ?? {})[key] as any;
      if (!prop) return undefined;
      if (prop.kind !== "enum" || !Array.isArray(prop.values) || prop.values.length !== 1) {
        return undefined;
      }
      return prop.values[0];
    });

    if (enumLikeValues.some((value) => value === undefined)) {
      continue;
    }

    const unique = new Set(enumLikeValues);
    if (unique.size === enumLikeValues.length) {
      return key;
    }
  }

  return undefined;
}

function normalizePropertyOrder(
  keys: string[],
  explicitOrder: unknown,
): string[] {
  const normalizedExplicit = Array.isArray(explicitOrder)
    ? explicitOrder
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const dedupedExplicit = Array.from(new Set(normalizedExplicit)).filter((key) =>
    keys.includes(key),
  );

  const remaining = keys.filter((key) => !dedupedExplicit.includes(key));
  return [...dedupedExplicit, ...remaining];
}

function applyFieldPropertyOrder(descriptor: FieldDescriptor): FieldDescriptor {
  if (!descriptor || typeof descriptor !== "object") return descriptor;

  if ((descriptor as any).type === "object") {
    const properties = ((descriptor as any).properties ?? {}) as Record<
      string,
      FieldDescriptor
    >;
    const keys = Object.keys(properties);

    for (const key of keys) {
      properties[key] = applyFieldPropertyOrder(properties[key]!);
    }

    (descriptor as any).propertyOrder = normalizePropertyOrder(
      keys,
      (descriptor as any).propertyOrder,
    );
    return descriptor;
  }

  if ((descriptor as any).type === "array" && (descriptor as any).items) {
    (descriptor as any).items = applyFieldPropertyOrder(
      (descriptor as any).items as FieldDescriptor,
    );
    return descriptor;
  }

  if ((descriptor as any).kind === "union" && Array.isArray((descriptor as any).anyOf)) {
    (descriptor as any).anyOf = ((descriptor as any).anyOf as FieldDescriptor[]).map(
      (branch) => applyFieldPropertyOrder(branch),
    );
    return descriptor;
  }

  return descriptor;
}

function applyDescriptorOrderingMetadata(descriptor: FullDescriptor): FullDescriptor {
  const rootsOrder = Object.keys(descriptor.roots ?? {});
  const modelsOrder = Object.keys(descriptor.models ?? {});

  for (const modelName of modelsOrder) {
    const model = descriptor.models?.[modelName];
    if (!model || typeof model !== "object") continue;

    const keys = Object.keys(model.properties ?? {});
    for (const key of keys) {
      model.properties[key] = applyFieldPropertyOrder(model.properties[key]!);
    }
    (model as any).propertyOrder = normalizePropertyOrder(
      keys,
      (model as any).propertyOrder,
    );
  }

  for (const rootName of rootsOrder) {
    const rootDescriptor = descriptor.roots?.[rootName];
    if (!rootDescriptor) continue;
    descriptor.roots[rootName] = applyFieldPropertyOrder(rootDescriptor);
  }

  descriptor.metadata = {
    ...(descriptor.metadata ?? {}),
    ordering: {
      ...((descriptor.metadata as any)?.ordering ?? {}),
      roots: rootsOrder,
      models: modelsOrder,
    },
  };

  return descriptor;
}

function collectModels(
  sourceFiles: SourceFile[],
  modelNames: Set<string>,
  modelMap: Record<string, ModelDescriptor>,
  warnings: DescriptorWarnings,
) {
  const handleShape = (name: string, type: Type, ctx: string) => {
    if (modelMap[name]) return;
    if (!modelNames.has(name)) return;
    if (!type.isObject()) return;
    modelMap[name] = {
      kind: "model",
      properties: buildProperties(type, modelNames, warnings, ctx),
    };
  };

  sourceFiles.forEach((sf) => {
    sf.getTypeAliases().forEach((alias: TypeAliasDeclaration) => {
      if (!alias.hasExportKeyword() && !alias.isDefaultExport()) return;
      handleShape(alias.getName(), alias.getType(), `model ${alias.getName()}`);
    });
    sf.getInterfaces().forEach((iface: InterfaceDeclaration) => {
      if (!iface.hasExportKeyword() && !iface.isDefaultExport()) return;
      handleShape(iface.getName(), iface.getType(), `model ${iface.getName()}`);
    });
  });
}

type Cms0InvocationInfo = {
  rootType: Type;
  locales?: string[];
  defaultLocale?: string;
};

function readCms0Options(invoc: CallExpression): {
  locales?: string[];
  defaultLocale?: string;
} {
  const arg = invoc.getArguments()[0];
  if (!arg || !Node.isObjectLiteralExpression(arg)) return {};
  const options: { locales?: string[]; defaultLocale?: string } = {};

  const localesProp = arg.getProperty("locales");
  if (localesProp && Node.isPropertyAssignment(localesProp)) {
    const init = localesProp.getInitializer();
    if (init && Node.isArrayLiteralExpression(init)) {
      const values = init
        .getElements()
        .map((el) => (Node.isStringLiteral(el) ? el.getLiteralValue() : null))
        .filter((val): val is string => Boolean(val));
      if (values.length) options.locales = values;
    }
  }

  const defaultProp = arg.getProperty("defaultLocale");
  if (defaultProp && Node.isPropertyAssignment(defaultProp)) {
    const init = defaultProp.getInitializer();
    if (init && Node.isStringLiteral(init)) {
      options.defaultLocale = init.getLiteralValue();
    }
  }

  return options;
}

function findRootInvocation(
  sourceFiles: SourceFile[],
): Cms0InvocationInfo | undefined {
  for (const sf of sourceFiles) {
    const invoc = sf
      ?.getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getExpression().getText() === "cms0");
    if (invoc) {
      const typeArgs = invoc.getTypeArguments();
      if (typeArgs.length > 0) {
        return {
          rootType: typeArgs[0]!.getType(),
          ...readCms0Options(invoc),
        };
      }
    }
  }
  return undefined;
}

function buildDescriptorAlt(resolved: ResolvedConfig): FullDescriptor {
  const tsconfig = resolved.tsconfigPath ?? findTsConfig(resolved.entryFile);
  const project = tsconfig
    ? new Project({ tsConfigFilePath: tsconfig })
    : new Project();
  const warnings: DescriptorWarnings = new Set();

  if (
    !project.getSourceFile(resolved.entryFile) &&
    fs.existsSync(resolved.entryFile)
  ) {
    project.addSourceFileAtPath(resolved.entryFile);
  }

  const entrySourceFile = project.getSourceFile(resolved.entryFile);
  if (!entrySourceFile) {
    throw new Error(`Could not load cms0 entry file: ${resolved.entryFile}`);
  }

  const invocation = findRootInvocation([entrySourceFile]);
  if (!invocation)
    throw new Error(
      "Could not locate cms0<T>() invocation in project sources.",
    );
  const rootType = invocation.rootType;
  const sourceFiles = collectRelevantSourceFiles(rootType, entrySourceFile);

  // Restrict models to only those referenced by the root type tree and exported in scope.
  const exportedModelNames = collectModelNames(sourceFiles);
  const collisions = Array.from(customTypeNames).filter((name) =>
    exportedModelNames.has(name),
  );
  if (collisions.length) {
    throw new Error(
      `cms0: custom type name collision: ${collisions.join(
        ", ",
      )}. Rename your model(s) or use a different custom type name.`,
    );
  }

  const referencedModelNames: Set<string> = new Set();
  collectReferencedModelNames(
    rootType,
    referencedModelNames,
    new Set<string>(),
    "root",
  );
  const referencedCustomTypeNames = new Set(
    Array.from(referencedModelNames).filter((n) => customTypeNames.has(n)),
  );
  const resolvedCustomTypeNames = resolveCustomTypeDependencies(
    referencedCustomTypeNames,
  );
  const resolvedCustomModelNames = new Set(
    Array.from(resolvedCustomTypeNames).filter((n) =>
      customModelTypeNames.has(n),
    ),
  );
  const modelNames: Set<string> = new Set([
    ...Array.from(referencedModelNames).filter((n) =>
      exportedModelNames.has(n),
    ),
    ...Array.from(resolvedCustomModelNames),
  ]);

  const modelMap: Record<string, ModelDescriptor> = {};
  collectModels(sourceFiles, modelNames, modelMap, warnings);
  resolvedCustomModelNames.forEach((name) => {
    if (modelMap[name]) {
      return;
    }
    const descriptor =
      customModelDescriptors[name as keyof typeof customModelDescriptors];
    if (descriptor) {
      modelMap[name] = descriptor;
    }
  });

  const roots: Record<string, RootDescriptor> = {};
  for (const prop of rootType.getProperties()) {
    const name = prop.getName();
    const decl = prop.getDeclarations()[0];
    if (!decl) continue;

    const analyzed = unwrapOptional(decl.getType());
    const propType = analyzed.base;
    const propOptional = prop.isOptional() || analyzed.optional;
    const propNullable = analyzed.nullable;

    if (propType.isArray()) {
      const elem = propType.getArrayElementTypeOrThrow();
      const itemDesc = descriptorFromType(
        elem,
        modelNames,
        warnings,
        `root ${name}[]`,
        { optional: false, nullable: false },
      );
      roots[name] = {
        type: "array",
        items: itemDesc,
        optional: propOptional,
        nullable: propNullable,
      };
      continue;
    }

    const fieldDesc = descriptorFromType(
      propType,
      modelNames,
      warnings,
      `root ${name}`,
      { optional: propOptional, nullable: propNullable },
    );

    roots[name] = fieldDesc;
  }

  if (warnings.size) warnings.forEach((w) => console.warn(w));

  const locales = invocation.locales;
  const defaultLocale = invocation.defaultLocale;

  const descriptor: FullDescriptor = {
    models: modelMap,
    roots,
    metadata:
      locales || defaultLocale
        ? {
            locales,
            defaultLocale,
          }
        : undefined,
  };

  return applyDescriptorOrderingMetadata(descriptor);
}

export { buildDescriptorAlt };
