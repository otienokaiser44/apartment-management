import type { Role } from "@/lib/auth/roles";

/** State returned by auth server actions to `useActionState` forms. */
export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialAuthFormState: AuthFormState = { status: "idle" };

/** The signed-in user as resolved on the server from the verified session and `profiles`. */
export type SessionUser = {
  id: string;
  email: string | null;
  role: Role;
  status: "active" | "suspended" | string;
  fullName: string | null;
  /** Storage path of the profile picture (private bucket; served through /account/avatar). */
  avatarPath: string | null;
};
