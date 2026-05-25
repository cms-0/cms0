// Publish the descriptor to the configured API endpoint when provided.
import { FullDescriptor } from "@cms0/shared";
import { ResolvedConfig } from "./types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class PublishHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`status ${status}`);
    this.name = "PublishHttpError";
    this.status = status;
  }
}

function isRetryablePublishStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function shouldRetryPublishError(error: unknown) {
  if (error instanceof PublishHttpError) {
    return isRetryablePublishStatus(error.status);
  }
  return true;
}

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function buildSchemaPublishUrl(baseUrl: string) {
  const normalized = trimTrailingSlashes(baseUrl);
  return `${normalized}/schema`;
}

function buildHealthUrls(baseUrl: string) {
  const normalized = trimTrailingSlashes(baseUrl);
  return [`${normalized}/health`];
}

const startSpinner = (label: string) => {
  if (!process.stdout.isTTY) {
    console.log(`${label}...`);
    return {
      stop: (message?: string) => {
        if (message) console.log(message);
      },
    };
  }

  const frames = ["|", "/", "-", "\\"];
  let idx = 0;
  const timer = setInterval(() => {
    const frame = frames[idx % frames.length];
    idx += 1;
    process.stdout.write(`\r${frame} ${label}`);
  }, 120);

  return {
    stop: (message?: string) => {
      clearInterval(timer);
      process.stdout.write("\r");
      if (message) process.stdout.write(`${message}\n`);
    },
  };
};

async function waitForAdminReady(
  baseUrl: string,
  headers: Record<string, string>,
) {
  const healthUrls = buildHealthUrls(baseUrl);
  const maxWaitMs = 30_000;
  const startedAt = Date.now();
  const spinner = startSpinner("cms0: waiting for admin to reload");

  await sleep(250);

  let attempt = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    attempt += 1;
    for (const healthUrl of healthUrls) {
      try {
        const res = await fetch(healthUrl, { headers });
        if (res.ok) {
          spinner.stop("cms0: admin ready");
          return true;
        }
      } catch {
        // ignore transient errors during restart
      }
    }
    await sleep(Math.min(500 + attempt * 250, 2000));
  }

  spinner.stop("cms0: admin restart timed out");
  return false;
}

async function publishDescriptor(
  resolved: ResolvedConfig,
  descriptor: FullDescriptor,
) {
  if (!resolved.apiBaseUrl) return;

  try {
    const payload = {
      version: new Date().toISOString(),
      descriptor,
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (resolved.apiKey) {
      headers["Authorization"] = `Bearer ${resolved.apiKey}`;
    }
    const target = buildSchemaPublishUrl(resolved.apiBaseUrl);
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(target, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new PublishHttpError(res.status);
        }
        const ready = await waitForAdminReady(
          trimTrailingSlashes(resolved.apiBaseUrl),
          headers,
        );
        if (!ready) {
          console.warn(
            "cms0: publish succeeded, but admin did not become healthy in time.",
          );
        }
        console.log(`cms0: published descriptor to ${target}`);
        return;
      } catch (err) {
        const canRetry = attempt < maxAttempts && shouldRetryPublishError(err);
        const waitMs = Math.min(2000 * attempt, 5000);
        console.warn(
          `cms0: publish attempt ${attempt}/${maxAttempts} failed (${
            err instanceof Error ? err.message : err
          }).` + (canRetry ? ` retrying in ${waitMs}ms...` : ""),
        );
        if (canRetry) {
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          console.warn("cms0: giving up on publishing descriptor for now.");
          return;
        }
      }
    }
  } catch (err) {
    console.warn(
      `cms0: failed to publish descriptor ${
        err instanceof Error ? err.message : err
      }`,
      err,
    );
  }
}

export { isRetryablePublishStatus, publishDescriptor };
