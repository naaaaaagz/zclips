import twitchMetadata from "../../../data/twitch-meta.json";
import { parseSheetPlaces } from "../../../public/map-utils.mjs";

const SOURCE = "1ZmgPHO2blY5aPFv97Ra_8kO2MexeO_SScGGjbS134ZQ";

export async function GET() {
  const endpoint = `https://docs.google.com/spreadsheets/d/${SOURCE}/gviz/tq?tqx=out:json&gid=0`;

  try {
    const response = await fetch(endpoint, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);

    const body = await response.text();
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    const payload = JSON.parse(body.slice(start, end + 1));

    const places = parseSheetPlaces(payload.table?.rows, twitchMetadata);
    if (!places.length) throw new Error("Source contains no valid places");

    return Response.json(places, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  } catch {
    return Response.json({ error: "Map data is temporarily unavailable." }, { status: 502 });
  }
}
