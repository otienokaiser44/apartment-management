import { Mail, Phone, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import type { PropertyContact } from "@/lib/services/tenant";

const ROLE_LABEL = { owner: "Landlord", property_manager: "Property manager", caretaker: "Caretaker" } as const;

/** Who to call or email about the property: the landlord and any assigned manager or caretaker. */
export function ContactCard({ contacts, fallback }: { contacts: PropertyContact[]; fallback: { name: string | null; phone: string | null; email: string | null } }) {
  // If the contact view has nothing (e.g. migration 035 not applied yet) fall back to the landlord details we already have.
  const list: PropertyContact[] = contacts.length
    ? contacts
    : [{ contact_role: "owner", display_name: fallback.name, phone: fallback.phone, email: fallback.email }];

  return (
    <Card>
      <CardHeader icon={Users} title="Your contacts" description="Reach the people looking after your home." />
      <ul className="space-y-4">
        {list.map((c, i) => (
          <li key={`${c.contact_role}-${i}`} className="flex items-start gap-3">
            <Avatar label={c.display_name ?? ROLE_LABEL[c.contact_role]} className="size-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.display_name ?? "Not provided"}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABEL[c.contact_role]}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Phone className="size-3.5" aria-hidden />
                    {c.phone}
                  </a>
                ) : null}
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{c.email}</span>
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
