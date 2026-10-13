import { loadPublicCityDirectory } from "../../../server/public-city-directory";

export const dynamic = "force-dynamic", runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await loadPublicCityDirectory(), {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return Response.json({ error: "The verified city directory is temporarily unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  }
}
