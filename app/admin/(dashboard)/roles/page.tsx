import { Plus, Users2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleDialog } from "@/components/admin/role-dialog";
import { RoleActiveToggle } from "@/components/admin/role-active-toggle";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { deleteRole } from "@/lib/actions/roles";

export default async function RolesPage() {
  const supabase = await createClient();
  const { data: roles } = await supabase.from("roles").select("*").order("created_at", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Roles"
        description="Job roles used to group assessments and candidates."
        actions={
          <RoleDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> Add role
              </Button>
            }
          />
        }
      />

      <Card className="border-border/70">
        <CardContent className="p-0">
          {!roles?.length ? (
            <div className="p-6">
              <EmptyState icon={Users2} title="No roles yet" description="Add a role like Full Stack Developer or Data Analyst to get started." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.label}</TableCell>
                    <TableCell className="text-muted-foreground">{role.key}</TableCell>
                    <TableCell>
                      <RoleActiveToggle id={role.id} isActive={role.is_active} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RoleDialog
                          role={role}
                          trigger={
                            <Button variant="ghost" size="icon">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Delete this role?"
                          description={`"${role.label}" will be removed. Assessments already using it are not deleted.`}
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() => deleteRole(role.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
