import { NavLink, Outlet } from "react-router-dom";

import { cn } from "@/lib/utils";

interface SectionTab {
  to: string;
  label: string;
}

interface SectionShellProps {
  title: string;
  subtitle?: string;
  tabs: SectionTab[];
}

export function SectionShell({ title, subtitle, tabs }: SectionShellProps) {
  return (
    <>
      <div className="border-b">
        <div className="flex items-center justify-between gap-4 px-6 pt-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <nav className="flex items-center gap-1 px-4 pt-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  "border-b-2 px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  );
}
