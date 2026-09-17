import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /share?title=&text=&url=
 *
 * Target of the manifest's `share_target`: sharing a link or a selection to
 * the installed app lands here. Nothing is saved yet. The text is handed to
 * the capture box on Today so it can be edited and sent like anything else.
 * Signed-out requests never get this far; the proxy sends them to /login.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parts = [params.get("title"), params.get("text"), params.get("url")]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  // Android often repeats the URL inside `text`.
  const unique = parts.filter((part, i) => !parts.some((other, j) => j !== i && other.includes(part) && other !== part));

  const home = new URL("/", request.url);
  if (unique.length) home.searchParams.set("capture", unique.join("\n").slice(0, 4000));
  return NextResponse.redirect(home);
}
