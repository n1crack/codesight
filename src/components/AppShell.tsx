import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const location = useLocation();
  return (
    <div className="flex h-full min-h-0 w-full bg-background">
      <Sidebar />
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
        <div
          key={location.pathname}
          className="flex flex-1 flex-col animate-in fade-in duration-200"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
