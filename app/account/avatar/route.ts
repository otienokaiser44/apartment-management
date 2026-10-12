import { loadMyAvatar } from "@/lib/services/account";

/** The signed-in user's own profile picture. The bucket is private, so it is streamed here under the user's session. */
export async function GET() {
  const avatar = await loadMyAvatar();
  if (!avatar) return new Response(null, { status: 404 });
  return new Response(avatar.bytes as BodyInit, {
    headers: {
      "Content-Type": avatar.mime,
      // The ?v= query changes whenever the picture does, so a long private cache is safe.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
