/**
 * Area -> Region -> NOP hierarchy, as returned by GET /auth/location-hierarchy.
 * Backed by app.query.location_hierarchy on the backend (live ingestion data) —
 * never hardcode this list in a component, it drifts as NOPs are added/renamed.
 */
export interface LocationHierarchy {
  areas: { name: string; regions: { name: string; nops: string[] }[] }[];
}

export function areaNames(h: LocationHierarchy | null): string[] {
  return h?.areas.map((a) => a.name) ?? [];
}

export function regionsForArea(h: LocationHierarchy | null, area: string): string[] {
  return h?.areas.find((a) => a.name === area)?.regions.map((r) => r.name) ?? [];
}

export function nopsForRegion(h: LocationHierarchy | null, area: string, region: string): string[] {
  return (
    h?.areas.find((a) => a.name === area)?.regions.find((r) => r.name === region)?.nops ?? []
  );
}

/** Dropdown options for a field, plus the current value if it isn't in the list
 * (e.g. legacy free-text data saved before this dropdown existed) — keeps it
 * visible/selected instead of silently clearing it. */
export function optionsWithCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}
