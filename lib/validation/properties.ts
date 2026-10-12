import { z } from "zod";
import { LANDLORD_UNIT_STATUSES, PROPERTY_TYPES } from "../../types/database.ts";

/** Blank form inputs arrive as "" and mean "not provided". */
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const optInt = (min: number, max: number) =>
  z.preprocess(
    blank,
    z.coerce.number("Floor must be a number.").int("Floor must be a whole number.").min(min).max(max).optional(),
  );
/** Required number: a blank input is "missing", not 0. */
const reqNum = (message: string) => z.preprocess(blank, z.coerce.number(message));

export const propertySchema = z.object({
  name: z.string().trim().min(2, "Enter the property name.").max(120),
  propertyType: z.enum(PROPERTY_TYPES, { error: "Choose a property type." }),
  description: optText(2000),
  addressLine1: z.string().trim().min(3, "Enter the street address.").max(200),
  addressLine2: optText(200),
  city: z.string().trim().min(2, "Enter the city or town.").max(100),
  countyOrRegion: optText(100),
  postalCode: optText(20),
  country: z.string().trim().length(2, "Use a 2-letter country code, e.g. KE.").toUpperCase().default("KE"),
  amenityIds: z.array(z.uuid()).default([]),
});

export const unitSchema = z.object({
  unitNumber: z.string().trim().min(1, "Enter a unit number.").max(40),
  unitType: optText(60),
  floorNumber: optInt(-5, 200),
  bedrooms: reqNum("Enter the bedrooms as a number.").pipe(z.number().int("Bedrooms must be a whole number.").min(0).max(50)),
  bathrooms: reqNum("Enter the bathrooms as a number.").pipe(
    z.number().min(0).max(50).multipleOf(0.5, "Use whole or half numbers."),
  ),
  monthlyRent: reqNum("Enter the monthly rent as a number.").pipe(
    z.number().min(0, "Rent cannot be negative.").max(100_000_000),
  ),
  securityDeposit: z.preprocess(
    blank,
    z.coerce.number("Deposit must be a number.").min(0, "Deposit cannot be negative.").max(100_000_000).default(0),
  ),
  currency: z.string().trim().length(3, "Use a 3-letter currency code.").toUpperCase().default("KES"),
  description: optText(2000),
  status: z.enum(LANDLORD_UNIT_STATUSES).default("vacant"),
  availableFrom: z.preprocess(blank, z.iso.date("Enter a valid date.").optional()),
});

export type PropertyInput = z.infer<typeof propertySchema>;
export type UnitInput = z.infer<typeof unitSchema>;
