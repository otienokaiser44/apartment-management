import type { FormFieldDef } from "@/components/forms/EntityForm";
import { PROPERTY_TYPES } from "@/types/database";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const propertyFields: FormFieldDef[] = [
  { name: "name", label: "Property name", type: "text", required: true, span: 2 },
  {
    name: "propertyType",
    label: "Property type",
    type: "select",
    required: true,
    options: PROPERTY_TYPES.map((t) => ({ value: t, label: cap(t) })),
  },
  { name: "country", label: "Country code", type: "text", required: true, hint: "2 letters, e.g. KE." },
  { name: "addressLine1", label: "Street address", type: "text", required: true, span: 2 },
  { name: "addressLine2", label: "Address line 2", type: "text" },
  { name: "city", label: "City / town", type: "text", required: true },
  { name: "countyOrRegion", label: "County / region", type: "text" },
  { name: "postalCode", label: "Postal code", type: "text" },
  { name: "description", label: "Description", type: "textarea", span: 2 },
];
