import { ExternalLink, FileJson } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./index-internal";
import { Button } from "./button";

type ApiReferenceFrameProps = {
  description?: string;
  jsonHref: string;
  previewHref: string;
  title: string;
};

export function ApiReferenceFrame({
  description,
  jsonHref,
  previewHref,
  title,
}: Readonly<ApiReferenceFrameProps>) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription className="max-w-3xl">
              {description}
            </CardDescription>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={jsonHref} target="_blank" rel="noreferrer">
              <FileJson />
              Raw OpenAPI JSON
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={previewHref} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open standalone
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <iframe
          title={title}
          src={previewHref}
          className="block h-[min(80vh,960px)] min-h-[720px] w-full border-0 bg-background"
        />
      </CardContent>
    </Card>
  );
}
