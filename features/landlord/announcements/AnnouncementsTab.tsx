import { Megaphone, Send } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { Card, CardHeader } from "@/components/ui/card";
import { listSentAnnouncements } from "@/lib/services/billing";
import { listUnits } from "@/lib/services/properties";
import { NOTICE_CATEGORY_LABEL } from "@/lib/validation/portal";
import { AnnouncementForm } from "./AnnouncementForm";

const AUDIENCE_LABEL: Record<string, string> = {
  all: "All tenants",
  floor: "Floor",
  unit: "One unit",
  unpaid_only: "Unpaid invoices",
};

export async function AnnouncementsTab({ propertyId }: { propertyId: string }) {
  const [units, sent] = await Promise.all([listUnits(propertyId), listSentAnnouncements(propertyId)]);
  const unitName = new Map(units.map((u) => [u.id, u.unit_number]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Send} title="New announcement" description="Choose who should receive it. Matching tenants see it on their dashboard instantly." />
        <AnnouncementForm propertyId={propertyId} units={units.map((u) => ({ id: u.id, unit_number: u.unit_number }))} />
      </Card>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Sent</h2>
        {sent.length === 0 ? (
          <EmptyState icon={Megaphone} title="Nothing sent yet" hint="Announcements you send appear here, with how many tenants received each." />
        ) : (
          <ul className="space-y-3">
            {sent.map((n) => {
              const target =
                n.target_audience === "floor" ? `Floor ${n.target_value}` :
                n.target_audience === "unit" ? `Unit ${unitName.get(n.target_value ?? "") ?? "?"}` :
                AUDIENCE_LABEL[n.target_audience] ?? n.target_audience;
              return (
                <li key={n.id} className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <StatusBadge status={n.category} label={NOTICE_CATEGORY_LABEL[n.category]} />
                      <strong>{n.title}</strong>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">{target}</span>
                      {n.recipients} recipient{n.recipients === 1 ? "" : "s"} · {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-foreground/80">{n.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
