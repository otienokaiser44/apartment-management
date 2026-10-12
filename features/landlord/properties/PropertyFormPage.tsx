import { notFound } from "next/navigation";
import { EntityForm } from "@/components/forms/EntityForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { getMyProperty, getPropertyAmenityIds, listAmenities } from "@/lib/services/properties";
import { createPropertyAction, updatePropertyAction } from "./actions";
import { propertyFields } from "./fields";

/** Create (no `propertyId`) or edit a property profile. New properties are saved as unpublished drafts. */
export async function PropertyFormPage({ propertyId }: { propertyId?: string }) {
  await requireRole("landlord"); // owner-only: managers cannot create or edit property profiles
  const [amenities, property, selected] = await Promise.all([
    listAmenities(),
    propertyId ? getMyProperty(propertyId) : Promise.resolve(null),
    propertyId ? getPropertyAmenityIds(propertyId) : Promise.resolve([]),
  ]);
  if (propertyId && !property) notFound();

  const values = property
    ? {
        name: property.name,
        propertyType: property.property_type,
        country: property.country,
        addressLine1: property.address_line_1,
        addressLine2: property.address_line_2,
        city: property.city,
        countyOrRegion: property.county_or_region,
        postalCode: property.postal_code,
        description: property.description,
      }
    : { propertyType: "apartment", country: "KE" };

  return (
    <>
      <PageHeader
        title={property ? `Edit ${property.name}` : "Add a property"}
        description={
          property
            ? "Update the property profile."
            : "Tell us about your building. It is saved as a draft; you can add units and submit for verification afterwards."
        }
      />
      <div className="max-w-3xl">
        <EntityForm
          action={propertyId ? updatePropertyAction.bind(null, propertyId) : createPropertyAction}
          fields={propertyFields}
          values={values}
          checkboxGroup={{
            name: "amenityIds",
            label: "Amenities",
            options: amenities.map((a) => ({ value: a.id, label: a.name })),
            selected,
          }}
          submitLabel={property ? "Save changes" : "Create property"}
          pendingLabel="Saving…"
        />
      </div>
    </>
  );
}
