import { notFound } from "next/navigation";
import { EntityForm, type FormFieldDef } from "@/components/forms/EntityForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { getMyProperty, getMyUnit } from "@/lib/services/properties";
import { LANDLORD_UNIT_STATUSES } from "@/types/database";
import { AddUnitsTabs } from "./AddUnitsTabs";
import { BulkUnits } from "./bulk/BulkUnits";
import { createUnitAction, updateUnitAction } from "./actions";

const statusField = (locked: boolean): FormFieldDef => ({
  name: "status",
  label: "Availability",
  type: "select",
  options: LANDLORD_UNIT_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
  hint: locked ? "Reserved/occupied units change status through tenancy actions." : undefined,
});

const baseFields: FormFieldDef[] = [
  { name: "unitNumber", label: "Unit number / name", type: "text", required: true },
  { name: "unitType", label: "Unit type", type: "text", hint: "e.g. Bedsitter, 2-bedroom." },
  { name: "bedrooms", label: "Bedrooms", type: "number", required: true, min: 0 },
  { name: "bathrooms", label: "Bathrooms", type: "number", required: true, min: 0, step: "0.5" },
  { name: "floorNumber", label: "Floor", type: "number" },
  { name: "availableFrom", label: "Available from", type: "date" },
  { name: "monthlyRent", label: "Monthly rent", type: "number", required: true, min: 0, step: "0.01" },
  { name: "securityDeposit", label: "Security deposit", type: "number", min: 0, step: "0.01" },
  { name: "currency", label: "Currency", type: "text", hint: "3 letters, e.g. KES." },
  { name: "description", label: "Description", type: "textarea", span: 2 },
];

/** Add (no `unitId`) or edit a unit. The property is resolved through RLS, so only the owner can reach it. */
export async function UnitFormPage({ propertyId, unitId }: { propertyId: string; unitId?: string }) {
  const [property, unit] = await Promise.all([getMyProperty(propertyId), unitId ? getMyUnit(propertyId, unitId) : null]);
  if (!property || (unitId && !unit)) notFound();

  const locked = unit?.status === "reserved" || unit?.status === "occupied";
  const fields = locked ? baseFields : [...baseFields.slice(0, 6), statusField(false), ...baseFields.slice(6)];
  const values = unit
    ? {
        unitNumber: unit.unit_number,
        unitType: unit.unit_type,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        floorNumber: unit.floor_number,
        availableFrom: unit.available_from,
        monthlyRent: unit.monthly_rent,
        securityDeposit: unit.security_deposit,
        currency: unit.currency,
        description: unit.description,
        status: unit.status,
      }
    : { currency: "KES", securityDeposit: 0, bedrooms: 1, bathrooms: 1, status: "vacant" };

  const form = (
    <EntityForm
      action={unitId ? updateUnitAction.bind(null, propertyId, unitId) : createUnitAction.bind(null, propertyId)}
      fields={fields}
      values={values}
      submitLabel={unit ? "Save changes" : "Add unit"}
      pendingLabel="Saving…"
    />
  );

  return (
    <>
      <PageHeader title={unit ? `Edit unit ${unit.unit_number}` : "Add units"} description={property.name} />
      {unit ? (
        <div className="max-w-3xl">
          {form}
          {locked ? (
            <p className="mt-3 text-xs text-muted-foreground">
              This unit is {unit.status}; its status changes through tenancy actions.
            </p>
          ) : null}
        </div>
      ) : (
        <AddUnitsTabs
          single={<div className="max-w-3xl">{form}</div>}
          bulk={<BulkUnits propertyId={propertyId} />}
        />
      )}
    </>
  );
}
