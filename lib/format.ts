// Display formatting shared by every area. Kenya-based: Nairobi time (UTC+3) so server and browser agree.

const TZ = "Africa/Nairobi";

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }) : "—";

/** Date-only values ("2026-10-12") are calendar days, so they are formatted without any time-zone shift. */
export const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return d.toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : TZ });
};

export const formatMoney = (amount: number | string | null | undefined, currency = "KES") =>
  `${currency} ${Number(amount ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "Oct 2026" for a billing period start. */
export const formatMonth = (periodStart: string) =>
  new Date(`${periodStart.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" });
