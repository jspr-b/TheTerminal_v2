/** The one API client. Components never call fetch themselves. */

export interface CommandLocation {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  kind: string;
  units: number;
  products: number;
}

export interface CommandProduct {
  id: string;
  title: string;
  units: number;
  by_location: { location_id: string; units: number }[];
  forecast_state: "too_few_sales";
}

export interface CommandView {
  locations: CommandLocation[];
  products: CommandProduct[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
// Local development only, until the login screen exists.
const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_TOKEN ?? "";
export const DEV_MERCHANT = process.env.NEXT_PUBLIC_DEV_MERCHANT ?? "";

export async function getCommand(merchantId: string): Promise<CommandView> {
  const res = await fetch(`${API_URL}/merchants/${merchantId}/command`, {
    headers: { Authorization: `Bearer ${DEV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Command failed: ${res.status}`);
  return res.json();
}

/** City-level position for a location. Shopify gives addresses, not coordinates. */
export async function geocodeCity(query: string): Promise<[number, number] | null> {
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&types=place&limit=1&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body: { features?: { geometry: { coordinates: [number, number] } }[] } = await res.json();
  return body.features?.[0]?.geometry.coordinates ?? null;
}

export { MAPBOX_TOKEN };
