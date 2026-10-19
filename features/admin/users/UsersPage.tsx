import { Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { cn } from "@/components/ui/cn";
import { requireRole } from "@/lib/auth/session";
import { listPeople, PEOPLE_ROLES, type PeopleRole } from "@/lib/services/adminDirectory";
import { formatDate } from "../format";
import { SearchForm } from "../SearchForm";

const th = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";
const LABEL: Record<PeopleRole, string> = { landlord: "Landlords", tenant: "Tenants", manager: "Managers" };

export const parsePeopleRole = (v: string | undefined): PeopleRole =>
  (PEOPLE_ROLES as readonly string[]).includes(v ?? "") ? (v as PeopleRole) : "tenant";

export async function AdminUsersPage({ role, q = "" }: { role: PeopleRole; q?: string }) {
  await requireRole("admin");
  const { rows, total, truncated, counts } = await listPeople(role, q);

  return (
    <>
      <PageHeader title="Users" description="Everyone with an account. Visitors browsing without signing up are not tracked." />

      <nav aria-label="User type" className="mb-4 flex gap-1 border-b border-border">
        {PEOPLE_ROLES.map((r) => (
          <Link
            key={r}
            href={`/admin/users?role=${r}`}
            aria-current={r === role ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              r === role ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {LABEL[r]} <span className="ml-1 text-xs tabular-nums text-muted-foreground">{counts[r]}</span>
          </Link>
        ))}
      </nav>

      <SearchForm placeholder="Search name, email or phone" q={q} hidden={{ role }} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No one matches" : `No ${LABEL[role].toLowerCase()} yet`}
          hint={q ? "Try a different search." : "They appear here once they sign up."}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Contact</th>
                  {role === "landlord" ? <th className={th}>Properties</th> : null}
                  {role === "tenant" ? <th className={th}>Residence</th> : null}
                  <th className={th}>Status</th>
                  <th className={th}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.name ?? <span className="text-muted-foreground">Unnamed</span>}</p>
                      {role === "landlord" && p.detail ? <p className="text-xs text-muted-foreground">{p.detail}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <p>{p.email ?? "-"}</p>
                      {p.phone ? <p className="text-xs text-muted-foreground">{p.phone}</p> : null}
                    </td>
                    {role === "landlord" ? <td className="px-4 py-3 tabular-nums">{p.properties}</td> : null}
                    {role === "tenant" ? (
                      <td className="px-4 py-3">{p.detail ?? <span className="text-muted-foreground">No tenancy</span>}</td>
                    ) : null}
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {truncated ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the newest {rows.length} of {total}. Search to find others.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
