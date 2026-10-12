import { exportMyData } from "@/lib/services/account";

/** Downloads the signed-in user's own data as JSON. Read-only; the response is never cached. */
export async function GET() {
  const data = await exportMyData();
  if (!data) return new Response("Not signed in", { status: 401 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${day}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
