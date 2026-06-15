import { AppHeader } from "@/components/AppHeader";
import { OpenFolder } from "@/components/OpenFolder";

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader subtitle="Open Folder" />
      <OpenFolder />
    </div>
  );
}
