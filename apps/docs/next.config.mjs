import nextra from "nextra";

function getBasePath() {
  const value = process.env.CMS0_DOCS_BASE_PATH?.trim();
  if (!value || value === "/") {
    return undefined;
  }

  return `/${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

const withNextra = nextra({
  search: {
    codeblocks: false,
  },
});

export default withNextra({
  basePath: getBasePath(),
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
});
