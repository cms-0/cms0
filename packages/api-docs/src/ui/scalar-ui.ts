/**
 * Scalar UI Renderer
 *
 * Generates HTML for Scalar API reference UI (loads via CDN).
 */

export function renderScalarUIHtml(options: {
  specUrl: string;
  title: string;
}): string {
  const { specUrl, title } = options;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <style>
      html, body { height: 100%; margin: 0; }
      body { background: #0b1020; }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${specUrl}"
      data-theme="dark"
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}
