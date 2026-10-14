import type { PropertyRow } from "@/lib/supabase/database.types";

export interface PropertyFormValues {
  title: string;
  property_type: string;
  market: string;
  transaction_type: string;
  city: string;
  district: string;
  street: string;
  show_street: boolean;
  area_m2: string;
  rooms: string;
  floor: string;
  total_floors: string;
  year_built: string;
  price: string;
  currency: string;
  description: string;
  features: string[];
  amenities: string[];
  agent_id: string;
  status: string;
}

export const EMPTY_PROPERTY: PropertyFormValues = {
  title: "", property_type: "apartment", market: "", transaction_type: "sale", city: "", district: "", street: "", show_street: false,
  area_m2: "", rooms: "", floor: "", total_floors: "", year_built: "", price: "", currency: "PLN", description: "", features: [], amenities: [], agent_id: "", status: "active",
};


const s = (v: number | string | null) => (v == null ? "" : String(v).replace(".", ","));

export function toFormValues(p: PropertyRow): PropertyFormValues {
  return {
    title: p.title, property_type: p.property_type, market: p.market ?? "", transaction_type: p.transaction_type, city: p.city ?? "", district: p.district ?? "",
    street: p.street ?? "", show_street: p.show_street, area_m2: s(p.area_m2), rooms: s(p.rooms), floor: s(p.floor), total_floors: s(p.total_floors),
    year_built: s(p.year_built), price: p.price == null ? "" : String(p.price), currency: p.currency, description: p.description ?? "", features: p.features,
    amenities: p.amenities, agent_id: p.agent_id ?? "", status: p.status,
  };
}
