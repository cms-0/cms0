import nextra from "nextra";

const withNextra = nextra({
  search: {
    codeblocks: false,
  },
});

export default withNextra({
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
});
