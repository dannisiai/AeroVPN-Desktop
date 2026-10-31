import type { AeroRegionSnapshot } from "./desktop";

export function nodeNumberForCity(
  regions: AeroRegionSnapshot[],
  regionId: string | null,
  cityId: string | null,
): number | null {
  if (regionId === null || cityId === null) return null;

  let number = 1;
  for (const region of regions) {
    for (const city of region.cities) {
      if (region.id === regionId && city.id === cityId) return number;
      number += 1;
    }
  }

  return null;
}
