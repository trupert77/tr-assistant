import { ImageResponse } from "next/og";

/**
 * App icons rendered from the logo mark, so there are no binary files to keep
 * in sync with the palette. Served at /icons/<name>.png:
 *
 *   192.png, 512.png   rounded square with transparent corners (any purpose)
 *   maskable-512.png   full-bleed, spark inset to the safe zone (maskable)
 *   apple-180.png      full-bleed; iOS applies its own corner mask
 *
 * The auth proxy skips /icons/, so these load before sign-in.
 */

const ICONS: Record<string, { size: number; bleed: boolean }> = {
  "192.png": { size: 192, bleed: false },
  "512.png": { size: 512, bleed: false },
  "maskable-512.png": { size: 512, bleed: true },
  "apple-180.png": { size: 180, bleed: true },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const spec = ICONS[name];
  if (!spec) return new Response("Not found", { status: 404 });

  const { size, bleed } = spec;
  // Maskable icons may be cropped to a circle; keep the spark inside 80%.
  const spark = Math.round(size * (bleed ? 0.46 : 0.58));

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: bleed ? 0 : Math.round(size * 0.22),
          background: "linear-gradient(135deg, #fb923c 0%, #fbbf24 100%)",
        }}
      >
        <svg
          width={spark}
          height={spark}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1a0e04"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
          <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
