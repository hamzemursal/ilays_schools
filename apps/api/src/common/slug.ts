// Slugs are derived on the fly from existing unique fields (School.name,
// AcademicYear.name, Section.name, and Class's own (division.type, level)
// pair) — never stored, never trusted as an identifier on their own. Every
// resolver that uses these tries a real database ID first (see each
// service's resolve*Identifier method) and only falls back to a slug match
// scoped to rows the actor is already authorized to see. A slug that
// doesn't resolve behaves exactly like an unresolvable ID already does:
// NotFoundException, nothing more specific.
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type DivisionSlugType = "PRIMARY" | "SECONDARY";

export function classSlug(divisionType: DivisionSlugType, level: number): string {
  return `${divisionType.toLowerCase()}-${level}`;
}

const CLASS_SLUG_PATTERN = /^(primary|secondary)-(\d+)$/;

export function parseClassSlug(slug: string): { divisionType: DivisionSlugType; level: number } | null {
  const match = CLASS_SLUG_PATTERN.exec(slug.trim().toLowerCase());
  if (!match) return null;
  return { divisionType: match[1].toUpperCase() as DivisionSlugType, level: Number(match[2]) };
}
