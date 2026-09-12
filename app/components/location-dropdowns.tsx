"use client";

/* Cascading Area -> Region -> NOP selects, fed by GET /auth/location-hierarchy.
   Shared by the user-admin modals and the reporting form. */

import React from "react";
import {
  LocationHierarchy,
  areaNames,
  regionsForArea,
  nopsForRegion,
  optionsWithCurrent,
} from "@/app/lib/locationHierarchy";

export const SELECT_CLASS =
  "w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-dark-3 dark:bg-dark-2 dark:text-white focus:border-primary dark:focus:border-primary transition-colors";

export function LocationDropdowns({
  hierarchy,
  area,
  region,
  nop,
  onAreaChange,
  onRegionChange,
  onNopChange,
}: {
  hierarchy: LocationHierarchy | null;
  area: string;
  region: string;
  nop: string;
  onAreaChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onNopChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Area</label>
        <select value={area} onChange={(e) => onAreaChange(e.target.value)} className={SELECT_CLASS}>
          <option value="" className="dark:bg-[#232220]">— Pilih Area —</option>
          {optionsWithCurrent(areaNames(hierarchy), area).map((a) => (
            <option key={a} value={a} className="dark:bg-[#232220]">{a}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">Region</label>
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          disabled={!area}
          className={SELECT_CLASS}
        >
          <option value="" className="dark:bg-[#232220]">— Pilih Region —</option>
          {optionsWithCurrent(regionsForArea(hierarchy, area), region).map((r) => (
            <option key={r} value={r} className="dark:bg-[#232220]">{r}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-dark dark:text-[#ece7dc]">NOP</label>
        <select
          value={nop}
          onChange={(e) => onNopChange(e.target.value)}
          disabled={!region}
          className={SELECT_CLASS}
        >
          <option value="" className="dark:bg-[#232220]">— Pilih NOP —</option>
          {optionsWithCurrent(nopsForRegion(hierarchy, area, region), nop).map((n) => (
            <option key={n} value={n} className="dark:bg-[#232220]">{n}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
