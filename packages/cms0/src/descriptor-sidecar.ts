function hashCms0SidecarSeed(seed: string) {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

function getCms0DescriptorSidecarPort(baseUrl?: string, apiKey?: string) {
  const seed = `${baseUrl?.trim() ?? ""}|${apiKey?.trim() ?? ""}`;
  return 43129 + (hashCms0SidecarSeed(seed) % 1000);
}

function getCms0DescriptorSidecarUrl(baseUrl?: string, apiKey?: string) {
  const port = getCms0DescriptorSidecarPort(baseUrl, apiKey);
  return `http://127.0.0.1:${port}/schema-descriptor`;
}

function getCms0DescriptorSidecarEventsUrl(baseUrl?: string, apiKey?: string) {
  const port = getCms0DescriptorSidecarPort(baseUrl, apiKey);
  return `http://127.0.0.1:${port}/schema-events`;
}

export {
  getCms0DescriptorSidecarPort,
  getCms0DescriptorSidecarUrl,
  getCms0DescriptorSidecarEventsUrl,
  hashCms0SidecarSeed,
};
