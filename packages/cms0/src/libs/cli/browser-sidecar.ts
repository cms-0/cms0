import http from "node:http";
import type { FullDescriptor } from "@cms0/shared";
import { getCms0DescriptorSidecarPort } from "../../descriptor-sidecar.js";
import type { ResolvedConfig } from "./types.js";

type DescriptorSidecarHandle = {
  updateDescriptor(descriptor: FullDescriptor): void;
  close(): Promise<void>;
};

function writeSchemaVersionEvent(
  response: http.ServerResponse<http.IncomingMessage>,
  version: number,
) {
  response.write(
    `event: schema-version\ndata: ${JSON.stringify({ version })}\n\n`,
  );
}

function startBrowserDescriptorSidecar(
  resolved: ResolvedConfig,
  initialDescriptor: FullDescriptor,
): Promise<DescriptorSidecarHandle> {
  const port = getCms0DescriptorSidecarPort(resolved.apiBaseUrl, resolved.apiKey);
  let currentDescriptor = initialDescriptor;
  let currentVersion = 1;
  const eventClients = new Set<http.ServerResponse<http.IncomingMessage>>();

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://127.0.0.1:${port}`,
    );

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/schema-events") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      response.write(": cms0 browser schema sidecar\n\n");
      eventClients.add(response);

      request.on("close", () => {
        eventClients.delete(response);
      });
      return;
    }

    if (request.method !== "GET" || requestUrl.pathname !== "/schema-descriptor") {
      response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(currentDescriptor));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      console.log(
        `cms0: browser descriptor sidecar listening on http://127.0.0.1:${port}/schema-descriptor`,
      );
      resolve({
        updateDescriptor(descriptor: FullDescriptor) {
          currentDescriptor = descriptor;
          currentVersion += 1;
          for (const client of [...eventClients]) {
            if (client.destroyed || client.writableEnded) {
              eventClients.delete(client);
              continue;
            }
            writeSchemaVersionEvent(client, currentVersion);
          }
        },
        close() {
          return new Promise<void>((closeResolve, closeReject) => {
            for (const client of eventClients) {
              client.end();
            }
            eventClients.clear();
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          });
        },
      });
    });
  });
}

export { startBrowserDescriptorSidecar };
