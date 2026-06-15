import { AppHeader } from "@/components/AppHeader";
import { WorkspaceLoader } from "@/components/WorkspaceLoader";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AppHeader subtitle="Workspace" back />
      <WorkspaceLoader workspaceId={id} />
    </div>
  );
}
