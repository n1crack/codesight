import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { AppTopBar } from "./AppTopBar";
import { CommandPalette } from "./CommandPalette";
import { Skeleton } from "./ui/Skeleton";

function PageFallback() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  return (
    <div className="flex h-full min-h-0 w-full bg-background">
      <Sidebar />
      <main className="flex h-full min-w-0 flex-1 flex-col">
        <AppTopBar />
        <div className="flex-1 overflow-y-auto">
          <div
            key={location.pathname}
            className="flex flex-1 flex-col animate-in fade-in duration-200"
          >
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
