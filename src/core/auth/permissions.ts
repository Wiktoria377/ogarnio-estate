/**
 * Role → permission matrix (client-safe, no server imports). The same rules are
 * enforced in the database (RLS policies and SECURITY DEFINER functions in
 * supabase/migrations); hiding a button in the UI is never the only check.
 */
export const WORKSPACE_ROLES = ["owner", "admin", "agent", "marketing", "viewer"] as const;
export type Role = (typeof WORKSPACE_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Właściciel",
  admin: "Administrator",
  agent: "Agent",
  marketing: "Marketing",
  viewer: "Podgląd",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Płatności, zespół i ustawienia firmy oraz wszystko, co administrator.",
  admin: "Nieruchomości, kampanie, materiały, publikacje i połączone konta.",
  agent: "Przypisane nieruchomości, materiały i kampanie. Publikacje wysyła do akceptacji.",
  marketing: "Materiały, kampanie i kalendarz publikacji z akceptacją. Bez płatności i edycji ofert.",
  viewer: "Tylko podgląd.",
};

export type Permission =
  | "billing.manage"
  | "team.manage"
  | "workspace.settings"
  | "workspace.delete"
  | "brand.edit"
  | "property.create"
  | "property.edit_any"
  | "property.edit_assigned"
  | "content.edit"
  | "publish.request"
  | "publish.approve"
  | "social.manage"
  | "import.run"
  | "leads.view_all"
  | "leads.view_assigned"
  | "leads.manage"
  | "analytics.view"
  | "usage.view";

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: [
    "billing.manage", "team.manage", "workspace.settings", "workspace.delete", "brand.edit",
    "property.create", "property.edit_any", "property.edit_assigned", "content.edit",
    "publish.request", "publish.approve", "social.manage", "import.run",
    "leads.view_all", "leads.view_assigned", "leads.manage", "analytics.view", "usage.view",
  ],
  admin: [
    "brand.edit", "property.create", "property.edit_any", "property.edit_assigned", "content.edit",
    "publish.request", "publish.approve", "social.manage", "import.run",
    "leads.view_all", "leads.view_assigned", "leads.manage", "analytics.view", "usage.view",
  ],
  agent: [
    "property.create", "property.edit_assigned", "content.edit", "publish.request",
    "leads.view_assigned", "leads.manage", "analytics.view",
  ],
  marketing: [
    "content.edit", "publish.request", "publish.approve", "leads.view_all", "analytics.view", "usage.view",
  ],
  viewer: ["analytics.view"],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role || !(role in MATRIX)) return false;
  return MATRIX[role as Role].includes(permission);
}

/** Roles that may hold a permission (used to mirror the matrix in SQL and docs). */
export function rolesWith(permission: Permission): Role[] {
  return WORKSPACE_ROLES.filter((r) => MATRIX[r].includes(permission));
}

/** Can this role edit this property? Agents only edit offers assigned to them or created by them. */
export function canEditProperty(role: string, userId: string, property: { agent_id: string | null; created_by: string | null }): boolean {
  if (can(role, "property.edit_any")) return true;
  return can(role, "property.edit_assigned") && (property.agent_id === userId || property.created_by === userId);
}

/** Roles the inviter may assign: only the owner can create other owners or admins. */
export function assignableRoles(inviterRole: string): Role[] {
  if (inviterRole === "owner") return ["admin", "agent", "marketing", "viewer"];
  return [];
}
