import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="flex h-full min-h-0 w-full bg-background">
      <Sidebar />
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
