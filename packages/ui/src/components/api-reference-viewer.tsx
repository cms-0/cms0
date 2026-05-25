import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "./index-internal";

export type ApiReferenceMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

export type ApiReferenceParameter = {
  description?: string;
  in: "path" | "query" | "header";
  name: string;
  required?: boolean;
  schema?: string;
};

export type ApiReferenceResponse = {
  description: string;
  example?: unknown;
  status: string;
};

export type ApiReferenceOperation = {
  description?: string;
  method: ApiReferenceMethod;
  parameters?: ApiReferenceParameter[];
  path: string;
  requestBodyExample?: unknown;
  responses: ApiReferenceResponse[];
  summary: string;
};

export type ApiReferenceSection = {
  description?: string;
  operations: ApiReferenceOperation[];
  title: string;
};

export type ApiReferenceServer = {
  description?: string;
  url: string;
};

export type ApiReferenceDocument = {
  description?: string;
  sections: ApiReferenceSection[];
  servers?: ApiReferenceServer[];
  spec?: unknown;
  title: string;
  version: string;
};

const methodVariant: Record<ApiReferenceMethod, "default" | "secondary" | "outline"> = {
  DELETE: "outline",
  GET: "secondary",
  PATCH: "outline",
  POST: "default",
  PUT: "outline",
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

export function ApiReferenceViewer({
  document,
}: Readonly<{
  document: ApiReferenceDocument;
}>) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="uppercase tracking-[0.18em]">
              API reference
            </Badge>
            <Badge variant="secondary">v{document.version}</Badge>
          </div>
          <CardTitle>{document.title}</CardTitle>
          {document.description ? (
            <CardDescription>{document.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          {document.servers?.length ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.18em]">
                Servers
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {document.servers.map((server) => (
                  <div key={server.url} className="rounded-lg border bg-muted/30 p-4">
                    <p className="font-mono text-xs text-foreground">{server.url}</p>
                    {server.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {server.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {document.spec ? (
            <>
              <Separator />
              <details className="rounded-lg border bg-muted/20 p-4">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  View raw specification JSON
                </summary>
                <pre className="mt-4 overflow-x-auto rounded-lg border bg-background p-4 text-xs leading-6 text-foreground">
                  {prettyJson(document.spec)}
                </pre>
              </details>
            </>
          ) : null}
        </CardContent>
      </Card>

      {document.sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            {section.description ? (
              <CardDescription>{section.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {section.operations.map((operation, index) => (
              <div key={`${operation.method}:${operation.path}`} className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 rounded-xl border bg-background/40 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={methodVariant[operation.method]}>
                      {operation.method}
                    </Badge>
                    <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">
                      {operation.path}
                    </code>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">
                      {operation.summary}
                    </h3>
                    {operation.description ? (
                      <p className="text-sm text-muted-foreground">
                        {operation.description}
                      </p>
                    ) : null}
                  </div>

                  {operation.parameters?.length ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Parameters
                      </p>
                      <div className="grid gap-3">
                        {operation.parameters.map((parameter) => (
                          <div
                            key={`${operation.path}:${parameter.in}:${parameter.name}`}
                            className="rounded-lg border bg-muted/30 p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <code className="text-xs text-foreground">
                                {parameter.name}
                              </code>
                              <Badge variant="outline">{parameter.in}</Badge>
                              {parameter.required ? (
                                <Badge variant="secondary">required</Badge>
                              ) : null}
                            </div>
                            {parameter.description ? (
                              <p className="mt-2 text-sm text-muted-foreground">
                                {parameter.description}
                              </p>
                            ) : null}
                            {parameter.schema ? (
                              <p className="mt-2 font-mono text-xs text-foreground">
                                {parameter.schema}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {operation.requestBodyExample !== undefined ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Request body example
                      </p>
                      <pre className="overflow-x-auto rounded-lg border bg-muted/20 p-4 text-xs leading-6 text-foreground">
                        {prettyJson(operation.requestBodyExample)}
                      </pre>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Responses
                    </p>
                    <div className="grid gap-3">
                      {operation.responses.map((response) => (
                        <div
                          key={`${operation.path}:${operation.method}:${response.status}`}
                          className="rounded-lg border bg-muted/30 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{response.status}</Badge>
                            <p className="text-sm text-foreground">
                              {response.description}
                            </p>
                          </div>
                          {response.example !== undefined ? (
                            <pre className="mt-3 overflow-x-auto rounded-lg border bg-background p-3 text-xs leading-6 text-foreground">
                              {prettyJson(response.example)}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {index < section.operations.length - 1 ? <Separator /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
