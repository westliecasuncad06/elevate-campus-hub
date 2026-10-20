import type { Role } from "@/lib/types";

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/admin",
  campus_head: "/campus-head",
  facilitator: "/facilitator",
  student: "/student",
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  campus_head: "Campus Head",
  facilitator: "Facilitator",
  student: "Student",
};

/** Which role owns a URL prefix, or null for shared/public paths. */
export function roleForPath(pathname: string): Role | null {
  for (const role of Object.keys(ROLE_HOME) as Role[]) {
    const base = ROLE_HOME[role];
    if (pathname === base || pathname.startsWith(`${base}/`)) return role;
  }
  return null;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLE_HOME;
}
