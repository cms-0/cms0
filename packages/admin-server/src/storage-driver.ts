import fs from "node:fs/promises";
import path from "node:path";
import {
  getAssetLogicalPath,
  getAssetPathSegment,
  joinStorageKey,
  normalizeAssetFilename,
  type AssetKind,
} from "@cms0/shared";

export type StorageFileInfo = { path: string; size: number };

export type StorageDriverAdapter = {
  stat(filePath: string): Promise<StorageFileInfo | null>;
  read(filePath: string): Promise<Buffer>;
  write(filePath: string, data: Buffer): Promise<void>;
  list(prefix: string): Promise<StorageFileInfo[]>;
  delete(filePath: string): Promise<void>;
};

export type RuntimeAssetStore = {
  delete(kind: AssetKind, filename: string): Promise<void>;
  getPublicUrl(kind: AssetKind, filename: string): string;
  getStorageKey(kind: AssetKind, filename: string): string;
  read(kind: AssetKind, filename: string): Promise<Buffer>;
  stat(kind: AssetKind, filename: string): Promise<StorageFileInfo | null>;
  write(kind: AssetKind, filename: string, data: Buffer): Promise<void>;
};

function stripPrefix(value: string, prefix: string): string {
  if (!prefix) return value;
  if (value === prefix) return "";
  if (value.startsWith(`${prefix}/`)) {
    return value.slice(prefix.length + 1);
  }
  return value;
}

function encodeKeySegment(segment: string): string {
  return encodeURIComponent(segment);
}

function encodeKeyPath(keyPath: string): string {
  return normalizeAssetFilename(keyPath)
    .split("/")
    .filter(Boolean)
    .map(encodeKeySegment)
    .join("/");
}

export function createRuntimeAssetStore(
  storage: StorageDriverAdapter,
  options: {
    keyPrefix?: string;
    publicBasePath: string;
    publicBaseUrl?: string;
  },
): RuntimeAssetStore {
  const normalizedKeyPrefix = options.keyPrefix?.trim()
    ? joinStorageKey(options.keyPrefix)
    : "";
  const normalizedBasePath =
    options.publicBasePath.startsWith("/")
      ? options.publicBasePath.replace(/\/+$/g, "")
      : `/${options.publicBasePath.replace(/\/+$/g, "")}`;
  const normalizedPublicBaseUrl = options.publicBaseUrl?.trim()
    ? options.publicBaseUrl.replace(/\/+$/g, "")
    : undefined;

  const getStorageKey = (kind: AssetKind, filename: string) =>
    joinStorageKey(normalizedKeyPrefix, getAssetLogicalPath(kind, filename));

  const getPublicUrl = (kind: AssetKind, filename: string) => {
    const relativePath = encodeKeyPath(
      joinStorageKey(getAssetPathSegment(kind), filename),
    );
    const pathUrl = `${normalizedBasePath}/${relativePath}`;
    return normalizedPublicBaseUrl
      ? `${normalizedPublicBaseUrl}${pathUrl}`
      : pathUrl;
  };

  return {
    async stat(kind, filename) {
      return storage.stat(getStorageKey(kind, filename));
    },
    async read(kind, filename) {
      return storage.read(getStorageKey(kind, filename));
    },
    async write(kind, filename, data) {
      await storage.write(getStorageKey(kind, filename), data);
    },
    async delete(kind, filename) {
      await storage.delete(getStorageKey(kind, filename));
    },
    getStorageKey,
    getPublicUrl,
  };
}

export function createScopedStorageDriver(
  storage: StorageDriverAdapter,
  keyPrefix: string,
): StorageDriverAdapter {
  const normalizedPrefix = keyPrefix.trim()
    ? joinStorageKey(keyPrefix)
    : "";

  if (!normalizedPrefix) {
    return storage;
  }

  const withPrefix = (filePath: string) =>
    joinStorageKey(normalizedPrefix, filePath);

  return {
    async stat(filePath) {
      const file = await storage.stat(withPrefix(filePath));
      if (!file) {
        return null;
      }

      return {
        path: stripPrefix(file.path, normalizedPrefix),
        size: file.size,
      };
    },
    async read(filePath) {
      return storage.read(withPrefix(filePath));
    },
    async write(filePath, data) {
      await storage.write(withPrefix(filePath), data);
    },
    async list(prefix) {
      const files = await storage.list(withPrefix(prefix));
      return files
        .map((file) => ({
          path: stripPrefix(file.path, normalizedPrefix),
          size: file.size,
        }))
        .filter((file) => file.path.length > 0);
    },
    async delete(filePath) {
      await storage.delete(withPrefix(filePath));
    },
  };
}

export function createLocalStorageDriver(
  rootPath: string,
): StorageDriverAdapter {
  const resolve = (filePath: string) => path.resolve(rootPath, filePath);

  return {
    async stat(filePath) {
      const fullPath = resolve(filePath);
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
          return null;
        }

        return {
          path: filePath,
          size: stat.size,
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return null;
        }
        throw error;
      }
    },
    async read(filePath) {
      return fs.readFile(resolve(filePath));
    },
    async write(filePath, data) {
      const fullPath = resolve(filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, data);
    },
    async list(prefix) {
      const fullPrefix = resolve(prefix);
      try {
        const result: { path: string; size: number }[] = [];

        async function walk(currentDir: string): Promise<void> {
          const entries = await fs.readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              await walk(fullPath);
              continue;
            }

            if (entry.isFile()) {
              const stat = await fs.stat(fullPath);
              result.push({
                path: path.relative(rootPath, fullPath),
                size: stat.size,
              });
            }
          }
        }

        await walk(fullPrefix);
        return result;
      } catch {
        return [];
      }
    },
    async delete(filePath) {
      await fs.unlink(resolve(filePath)).catch(() => {});
    },
  };
}

export type S3StorageConfig = {
  endpoint?: string;
  forcePathStyle?: boolean;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createS3StorageDriver(
  config: S3StorageConfig,
): StorageDriverAdapter {
  // Lazy-load the AWS SDK to avoid bundling it when not needed
  let s3Client: any = null;

  async function getClient() {
    if (s3Client) return s3Client;
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? !!config.endpoint,
    });
    return s3Client;
  }

  return {
    async stat(filePath) {
      const client = await getClient();
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");

      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: filePath,
          }),
        );

        return {
          path: filePath,
          size: Number(response.ContentLength ?? 0),
        };
      } catch (error) {
        const metadata = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata;
        const name = (error as { name?: string }).name;
        if (metadata?.httpStatusCode === 404 || name === "NotFound") {
          return null;
        }
        throw error;
      }
    },
    async read(filePath) {
      const client = await getClient();
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: filePath }),
      );
      const chunks: Uint8Array[] = [];
      // @ts-ignore - Body is a readable stream
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks as Uint8Array[]);
    },
    async write(filePath, data) {
      const client = await getClient();
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: filePath,
          Body: data,
        }),
      );
    },
    async list(prefix) {
      const client = await getClient();
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const result: { path: string; size: number }[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const item of response.Contents ?? []) {
          if (item.Key) {
            result.push({ path: item.Key, size: item.Size ?? 0 });
          }
        }
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
      return result;
    },
    async delete(filePath) {
      const client = await getClient();
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: filePath }),
      );
    },
  };
}

export function resolveStorageDriver(
  driverName: string | undefined,
  options: {
    localRoot: string;
    s3Config?: S3StorageConfig;
  },
): StorageDriverAdapter {
  const driver = driverName ?? "local";
  if (driver === "s3" || driver === "s3-compatible") {
    if (!options.s3Config) {
      throw new Error("S3 storage driver requested but no S3 config provided");
    }
    return createS3StorageDriver(options.s3Config);
  }
  return createLocalStorageDriver(options.localRoot);
}
