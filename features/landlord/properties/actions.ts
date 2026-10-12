"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createProperty, updateProperty } from "@/lib/services/properties";
import { propertySchema } from "@/lib/validation/properties";
import type { FormState } from "@/types/forms";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function parse(fd: FormData) {
  return propertySchema.safeParse({
    name: text(fd, "name"),
    propertyType: text(fd, "propertyType"),
    description: text(fd, "description"),
    addressLine1: text(fd, "addressLine1"),
    addressLine2: text(fd, "addressLine2"),
    city: text(fd, "city"),
    countyOrRegion: text(fd, "countyOrRegion"),
    postalCode: text(fd, "postalCode"),
    country: text(fd, "country") || "KE",
    amenityIds: fd.getAll("amenityIds").filter((v): v is string => typeof v === "string"),
  });
}

const invalid = (fieldErrors: FormState["fieldErrors"]): FormState => ({
  status: "error",
  message: "Please fix the highlighted fields.",
  fieldErrors,
});

export async function createPropertyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("landlord");
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await createProperty(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  redirect(`/landlord/properties/${result.data.id}`);
}

export async function updatePropertyAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("landlord");
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await updateProperty(id, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  redirect(`/landlord/properties/${id}`);
}
