const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : "-");
export const formatDateTime = (iso: string | null) => (iso ? DATE_TIME.format(new Date(iso)) : "-");

/** "property_submitted_for_verification" -> "Property submitted for verification" */
export const humanizeAction = (action: string) => action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
