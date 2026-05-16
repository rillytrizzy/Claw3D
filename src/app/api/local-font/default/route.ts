import { readFile } from "node:fs/promises";

export const runtime = "nodejs";

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/lucon.ttf",
  "C:/Windows/Fonts/ARIALN.TTF",
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/SFNS.ttf",
] as const;

const loadFont = async () => {
  for (const path of FONT_CANDIDATES) {
    try {
      return await readFile(path);
    } catch {
      // Try the next common system font location.
    }
  }
  return null;
};

export async function GET() {
  const font = await loadFont();
  if (!font) {
    return Response.json(
      { error: "No supported local font found." },
      { status: 404 },
    );
  }

  return new Response(new Uint8Array(font), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "font/ttf",
    },
  });
}
