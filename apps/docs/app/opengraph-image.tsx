import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const alt = "cms0 documentation";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#070707",
          color: "white",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background:
              "radial-gradient(circle at 20% 22%, rgba(124, 58, 237, 0.38), transparent 34%), radial-gradient(circle at 82% 12%, rgba(34, 197, 94, 0.22), transparent 32%)",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            border: "1px solid rgba(255, 255, 255, 0.16)",
            borderRadius: 28,
            display: "flex",
            flexDirection: "column",
            gap: 26,
            padding: "64px 72px",
            position: "relative",
            width: 920,
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: 30,
              letterSpacing: 0,
              textTransform: "uppercase",
            }}
          >
            cms0 docs
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 78,
              fontWeight: 700,
              letterSpacing: 0,
              lineHeight: 0.98,
            }}
          >
            <span>Build with a</span>
            <span>type-first CMS</span>
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.74)",
              fontSize: 32,
              lineHeight: 1.35,
              maxWidth: 790,
            }}
          >
            Guides for hosted workspaces, self-hosted admin, app integration,
            and runtime APIs.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
