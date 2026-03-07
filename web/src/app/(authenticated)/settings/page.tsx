"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Role,
  type Permission,
  type AdminUser,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
  addPermission,
  removePermission,
  listUsers,
  createUser,
  updateUser,
  assignRole,
  removeUserRole,
} from "@/lib/admin-api";
import { Plus, Trash2, Shield, UserPlus, X } from "lucide-react";

// ── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ roles }: { roles: Role[] }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addName, setAddName] = useState("");
  const [addRoleId, setAddRoleId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async () => {
    setError("");
    try {
      await createUser(addEmail, addPassword, addName, addRoleId ? [addRoleId] : []);
      setShowAdd(false);
      setAddEmail("");
      setAddPassword("");
      setAddName("");
      setAddRoleId("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    const newStatus = user.status === "active" ? "disabled" : "active";
    try {
      await updateUser(user.id, { status: newStatus });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      await assignRole(userId, roleId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    try {
      await removeUserRole(userId, roleId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading users...</p>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{users.length} user(s)</p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Add User
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.full_name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r.id} variant={r.name === "System Manager" ? "default" : "secondary"} className="gap-1">
                      {r.name}
                      <button
                        onClick={() => handleRemoveRole(u.id, r.id)}
                        className="ml-0.5 hover:text-destructive"
                        title="Remove role"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Select onValueChange={(v) => handleAssignRole(u.id, v)}>
                    <SelectTrigger className="h-6 w-6 p-0 border-dashed">
                      <Plus className="h-3 w-3" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles
                        .filter((r) => !u.roles.some((ur) => ur.id === r.id))
                        .map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={u.status === "active" ? "default" : "destructive"}>
                  {u.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggleStatus(u)}
                >
                  {u.status === "active" ? "Disable" : "Enable"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full Name</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="jane@example.com" type="email" />
            </div>
            <div>
              <Label>Password</Label>
              <Input value={addPassword} onChange={(e) => setAddPassword(e.target.value)} type="password" placeholder="Min 8 chars, 1 upper, 1 lower, 1 digit" />
            </div>
            <div>
              <Label>Role (optional)</Label>
              <Select value={addRoleId} onValueChange={setAddRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!addEmail || !addPassword}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [permSkill, setPermSkill] = useState("");
  const [permPattern, setPermPattern] = useState("*");
  const [error, setError] = useState("");

  const refreshRoles = useCallback(async () => {
    try {
      const r = await listRoles();
      setRoles(r);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshRoles(); }, [refreshRoles]);

  const handleSelectRole = async (role: Role) => {
    setSelectedRole(role);
    setError("");
    try {
      setPermissions(await listPermissions(role.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleAddRole = async () => {
    setError("");
    try {
      const role = await createRole(newRoleName, newRoleDesc);
      setShowAddRole(false);
      setNewRoleName("");
      setNewRoleDesc("");
      await refreshRoles();
      handleSelectRole(role);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    setError("");
    try {
      await deleteRole(role.id);
      if (selectedRole?.id === role.id) {
        setSelectedRole(null);
        setPermissions([]);
      }
      await refreshRoles();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleAddPerm = async () => {
    if (!selectedRole || !permSkill) return;
    setError("");
    try {
      await addPermission(selectedRole.id, permSkill, permPattern);
      setPermissions(await listPermissions(selectedRole.id));
      setPermSkill("");
      setPermPattern("*");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleRemovePerm = async (permId: string) => {
    if (!selectedRole) return;
    setError("");
    try {
      await removePermission(selectedRole.id, permId);
      setPermissions(await listPermissions(selectedRole.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading roles...</p>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Role list */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Roles</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddRole(true)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => handleSelectRole(r)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors ${
                  selectedRole?.id === r.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{r.name}</span>
                  {r.is_system && <Badge variant="outline" className="text-[10px] px-1">System</Badge>}
                </div>
                {!r.is_system && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRole(r); }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Permission editor */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedRole ? `Permissions: ${selectedRole.name}` : "Select a role"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRole ? (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Skill</TableHead>
                      <TableHead>Action Pattern</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permissions.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.skill}</TableCell>
                        <TableCell className="font-mono text-xs">{p.action_pattern}</TableCell>
                        <TableCell>
                          <Badge variant={p.allowed ? "default" : "destructive"}>
                            {p.allowed ? "Allow" : "Deny"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => handleRemovePerm(p.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {permissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                          No permissions configured
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {/* Add permission form */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Skill</Label>
                    <Input
                      value={permSkill}
                      onChange={(e) => setPermSkill(e.target.value)}
                      placeholder="e.g. erpclaw or *"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Action Pattern</Label>
                    <Input
                      value={permPattern}
                      onChange={(e) => setPermPattern(e.target.value)}
                      placeholder="e.g. list-* or *"
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button size="sm" onClick={handleAddPerm} disabled={!permSkill}>
                    Add
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Click a role to manage its permissions
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Role Dialog */}
      <Dialog open={showAddRole} onOpenChange={setShowAddRole}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Role Name</Label>
              <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Accountant" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="What this role can do" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRole(false)}>Cancel</Button>
            <Button onClick={handleAddRole} disabled={!newRoleName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    listRoles().then(setRoles).catch(() => {});
  }, []);

  return (
    <div className="flex-1 p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab roles={roles} />
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
