/**
 * Admin API hooks for RBAC management (roles, permissions, users).
 * All endpoints require System Manager role.
 */
import { fetchApi } from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  permission_count?: number;
  user_count?: number;
}

export interface Permission {
  id: string;
  skill: string;
  action_pattern: string;
  allowed: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  status: string;
  last_login: string | null;
  created_at: string;
  roles: { id: string; name: string }[];
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<Role[]> {
  const data = await fetchApi("/admin/roles");
  return (data.roles as Role[]) || [];
}

export async function createRole(name: string, description: string): Promise<Role> {
  const data = await fetchApi("/admin/roles", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  return data.role as Role;
}

export async function updateRole(roleId: string, name: string, description: string): Promise<void> {
  await fetchApi(`/admin/roles/${roleId}`, {
    method: "PUT",
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteRole(roleId: string): Promise<void> {
  await fetchApi(`/admin/roles/${roleId}`, { method: "DELETE" });
}

// ── Permissions ──────────────────────────────────────────────────────────────

export async function listPermissions(roleId: string): Promise<Permission[]> {
  const data = await fetchApi(`/admin/roles/${roleId}/permissions`);
  return (data.permissions as Permission[]) || [];
}

export async function addPermission(
  roleId: string,
  skill: string,
  actionPattern: string,
  allowed: boolean = true,
): Promise<Permission> {
  const data = await fetchApi(`/admin/roles/${roleId}/permissions`, {
    method: "POST",
    body: JSON.stringify({ skill, action_pattern: actionPattern, allowed }),
  });
  return data.permission as Permission;
}

export async function removePermission(roleId: string, permId: string): Promise<void> {
  await fetchApi(`/admin/roles/${roleId}/permissions/${permId}`, { method: "DELETE" });
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<AdminUser[]> {
  const data = await fetchApi("/admin/users");
  return (data.users as AdminUser[]) || [];
}

export async function createUser(
  email: string,
  password: string,
  fullName: string,
  roleIds: string[],
): Promise<AdminUser> {
  const data = await fetchApi("/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName, role_ids: roleIds }),
  });
  return data.user as AdminUser;
}

export async function updateUser(
  userId: string,
  updates: { full_name?: string; status?: string; password?: string },
): Promise<void> {
  await fetchApi(`/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  await fetchApi(`/admin/users/${userId}/roles`, {
    method: "POST",
    body: JSON.stringify({ role_id: roleId }),
  });
}

export async function removeUserRole(userId: string, roleId: string): Promise<void> {
  await fetchApi(`/admin/users/${userId}/roles/${roleId}`, { method: "DELETE" });
}
