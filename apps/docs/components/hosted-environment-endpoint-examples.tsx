import { Callout, Pre } from "nextra/components";

import { getHostedEnvironmentEndpointExamples } from "../lib/env";

export function HostedEnvironmentEndpointExamples({
  environmentKey = "environment-key",
}: {
  environmentKey?: string;
}) {
  const endpoints = getHostedEnvironmentEndpointExamples(environmentKey);

  if (endpoints.length === 0) {
    return (
      <Callout type="warning">
        Hosted environment runtime endpoints are disabled for this docs build.
      </Callout>
    );
  }

  return (
    <Pre
      data-copy=""
      data-filename="Hosted endpoint examples"
      data-language="txt"
    >
      <code>{endpoints.join("\n")}</code>
    </Pre>
  );
}
