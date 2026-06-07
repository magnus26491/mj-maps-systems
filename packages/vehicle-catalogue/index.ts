/**
 * packages/vehicle-catalogue/index.ts
 * Complete UK delivery vehicle catalogue with real-world specs.
 * Used by API (vehicle lookup on driver update) and driver app (dropdowns + info panel).
 */


export type VehicleCategory =
  | 'small_van' | 'swb_van' | 'lwb_van' | 'luton'
  | 'rigid_7_5t' | 'rigid_18t' | 'artic';


export interface VehicleSpec {
  make: string;
  model: string;
  category: VehicleCategory;
  /** First and last year this model was available for selection */
  yearFrom: number;
  yearTo: number;
  heightM: number;        // overall vehicle height including body
  payloadKg: number;      // max payload
  gvwKg: number;          // gross vehicle weight
  lengthM: number;        // overall length
  bridgeRestricted: boolean; // true if height > 2.9m (most UK bridge clearances)
  hgv: boolean;           // true if requires HGV licence / OSM HGV routing
  /** Maps to existing vehicleId string used in route-engine / bridge-engine */
  vehicleId: string;
}


export const VEHICLE_CATALOGUE: VehicleSpec[] = [
  // ── Small vans ─────────────────────────────────────────────────────────────
  { make:'Volkswagen',    model:'Caddy',               category:'small_van',  yearFrom:2015, yearTo:2024, heightM:1.82, payloadKg:720,   gvwKg:2080,  lengthM:4.50, bridgeRestricted:false, hgv:false, vehicleId:'small_van' },
  { make:'Ford',          model:'Transit Connect',     category:'small_van',  yearFrom:2013, yearTo:2024, heightM:1.83, payloadKg:770,   gvwKg:2230,  lengthM:4.42, bridgeRestricted:false, hgv:false, vehicleId:'small_van' },
  { make:'Renault',       model:'Kangoo',              category:'small_van',  yearFrom:2013, yearTo:2024, heightM:1.81, payloadKg:650,   gvwKg:2000,  lengthM:4.28, bridgeRestricted:false, hgv:false, vehicleId:'small_van' },
  { make:'Peugeot',       model:'Partner',            category:'small_van',  yearFrom:2012, yearTo:2024, heightM:1.81, payloadKg:700,   gvwKg:2068,  lengthM:4.38, bridgeRestricted:false, hgv:false, vehicleId:'small_van' },


  // ── SWB vans ────────────────────────────────────────────────────────────────
  { make:'Ford',          model:'Transit Custom SWB',  category:'swb_van',   yearFrom:2013, yearTo:2024, heightM:1.97, payloadKg:1300,  gvwKg:2880,  lengthM:4.98, bridgeRestricted:false, hgv:false, vehicleId:'swb_van' },
  { make:'Mercedes-Benz', model:'Sprinter 314 SWB',    category:'swb_van',   yearFrom:2014, yearTo:2024, heightM:2.37, payloadKg:1215,  gvwKg:3500,  lengthM:5.91, bridgeRestricted:false, hgv:false, vehicleId:'swb_van' },
  { make:'Volkswagen',    model:'Crafter MWB',         category:'swb_van',   yearFrom:2017, yearTo:2024, heightM:2.35, payloadKg:1255,  gvwKg:3500,  lengthM:6.00, bridgeRestricted:false, hgv:false, vehicleId:'swb_van' },


  // ── LWB vans ────────────────────────────────────────────────────────────────
  { make:'Ford',          model:'Transit Custom LWB',  category:'lwb_van',   yearFrom:2013, yearTo:2024, heightM:1.97, payloadKg:1250,  gvwKg:2880,  lengthM:5.34, bridgeRestricted:false, hgv:false, vehicleId:'lwb_van' },
  { make:'Mercedes-Benz', model:'Sprinter 316 LWB',    category:'lwb_van',   yearFrom:2014, yearTo:2024, heightM:2.37, payloadKg:1120,  gvwKg:3500,  lengthM:6.95, bridgeRestricted:false, hgv:false, vehicleId:'lwb_van' },
  { make:'Vauxhall',      model:'Movano L2H2',         category:'lwb_van',   yearFrom:2014, yearTo:2024, heightM:2.50, payloadKg:1590,  gvwKg:3500,  lengthM:6.20, bridgeRestricted:false, hgv:false, vehicleId:'lwb_van' },


  // ── Luton / Box ─────────────────────────────────────────────────────────────
  { make:'Ford',          model:'Transit 350 Luton',   category:'luton',     yearFrom:2014, yearTo:2024, heightM:3.10, payloadKg:1300,  gvwKg:3500,  lengthM:6.00, bridgeRestricted:true,  hgv:false, vehicleId:'luton' },
  { make:'Mercedes-Benz', model:'Sprinter 3.5t Luton', category:'luton',     yearFrom:2014, yearTo:2024, heightM:3.20, payloadKg:1200,  gvwKg:3500,  lengthM:6.10, bridgeRestricted:true,  hgv:false, vehicleId:'luton' },
  { make:'Iveco',         model:'Daily 35S Luton',     category:'luton',     yearFrom:2014, yearTo:2024, heightM:3.25, payloadKg:1350,  gvwKg:3500,  lengthM:6.40, bridgeRestricted:true,  hgv:false, vehicleId:'luton' },


  // ── 7.5t HGV ───────────────────────────────────────────────────────────────
  { make:'Mercedes-Benz', model:'Atego 816',           category:'rigid_7_5t',yearFrom:2014, yearTo:2024, heightM:3.60, payloadKg:3500,  gvwKg:7500,  lengthM:7.50, bridgeRestricted:true,  hgv:true,  vehicleId:'rigid_7.5t' },
  { make:'DAF',           model:'LF 55',               category:'rigid_7_5t',yearFrom:2013, yearTo:2024, heightM:3.65, payloadKg:3200,  gvwKg:7500,  lengthM:7.80, bridgeRestricted:true,  hgv:true,  vehicleId:'rigid_7.5t' },
  { make:'Iveco',         model:'Eurocargo 75E',       category:'rigid_7_5t',yearFrom:2013, yearTo:2024, heightM:3.60, payloadKg:3400,  gvwKg:7500,  lengthM:7.60, bridgeRestricted:true,  hgv:true,  vehicleId:'rigid_7.5t' },


  // ── 18t HGV ─────────────────────────────────────────────────────────────────
  { make:'Mercedes-Benz', model:'Atego 1824',          category:'rigid_18t', yearFrom:2014, yearTo:2024, heightM:4.00, payloadKg:9000,  gvwKg:18000, lengthM:9.50, bridgeRestricted:true,  hgv:true,  vehicleId:'rigid_18t' },
  { make:'DAF',           model:'CF 340',              category:'rigid_18t', yearFrom:2013, yearTo:2024, heightM:4.00, payloadKg:8800,  gvwKg:18000, lengthM:9.60, bridgeRestricted:true,  hgv:true,  vehicleId:'rigid_18t' },


  // ── Artic ───────────────────────────────────────────────────────────────────
  { make:'Volvo',         model:'FH 460',              category:'artic',     yearFrom:2013, yearTo:2024, heightM:4.20, payloadKg:26000, gvwKg:44000, lengthM:16.50,bridgeRestricted:true,  hgv:true,  vehicleId:'artic' },
  { make:'DAF',           model:'XF 480',              category:'artic',     yearFrom:2015, yearTo:2024, heightM:4.20, payloadKg:25500, gvwKg:44000, lengthM:16.50,bridgeRestricted:true,  hgv:true,  vehicleId:'artic' },
  { make:'Mercedes-Benz', model:'Actros 2545',         category:'artic',     yearFrom:2014, yearTo:2024, heightM:4.25, payloadKg:25000, gvwKg:44000, lengthM:16.50,bridgeRestricted:true,  hgv:true,  vehicleId:'artic' },
];


/** Get all unique makes in alphabetical order */
export function getMakes(): string[] {
  return [...new Set(VEHICLE_CATALOGUE.map(v => v.make))].sort();
}


/** Get all models for a given make */
export function getModelsForMake(make: string): VehicleSpec[] {
  return VEHICLE_CATALOGUE.filter(v => v.make === make);
}


/** Get available years for a specific make + model */
export function getYearsForModel(make: string, model: string): number[] {
  const spec = VEHICLE_CATALOGUE.find(v => v.make === make && v.model === model);
  if (!spec) return [];
  const years: number[] = [];
  for (let y = spec.yearFrom; y <= spec.yearTo; y++) years.push(y);
  return years;
}


/** Look up a vehicle spec by make + model. Year is informational only. */
export function lookupVehicle(make: string, model: string): VehicleSpec | null {
  return VEHICLE_CATALOGUE.find(v => v.make === make && v.model === model) ?? null;
}