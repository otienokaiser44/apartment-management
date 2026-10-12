import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/lib/services/auth";

/** POST only (a link or image tag cannot log a user out). 303 so the browser follows with GET. */
export async function POST(request: NextRequest) {
  await signOut();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
