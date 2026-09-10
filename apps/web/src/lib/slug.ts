// Mirrors apps/api/src/common/slug.ts — used here only to construct outgoing
// links from already-resolved data (a class/section the page already
// loaded), never to interpret an incoming URL. The backend is the only
// place a slug is ever resolved back into a real id.
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function classSlug(divisionType: "PRIMARY" | "SECONDARY", level: number): string {
  return `${divisionType.toLowerCase()}-${level}`;
}
