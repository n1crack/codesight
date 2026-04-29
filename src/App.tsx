import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { OverviewPage } from "@/pages/Overview";
import { HeatmapPage } from "@/pages/HeatmapPage";
import { TimelinePage } from "@/pages/TimelinePage";
import { ActivityPage } from "@/pages/ActivityPage";
import { TagsPage } from "@/pages/TagsPage";
import { BranchesPage } from "@/pages/BranchesPage";
import { ContributorsPage } from "@/pages/ContributorsPage";
import { ContributorDetailPage } from "@/pages/ContributorDetailPage";
import { OwnershipPage } from "@/pages/OwnershipPage";
import { SearchPage } from "@/pages/SearchPage";
import { GraphPage } from "@/pages/GraphPage";
import { ComparisonPage } from "@/pages/ComparisonPage";
import { SettingsPage } from "@/pages/SettingsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "heatmap", element: <HeatmapPage /> },
      { path: "timeline", element: <TimelinePage /> },
      { path: "activity", element: <ActivityPage /> },
      { path: "branches", element: <BranchesPage /> },
      { path: "tags", element: <TagsPage /> },
      { path: "contributors", element: <ContributorsPage /> },
      { path: "contributors/:email", element: <ContributorDetailPage /> },
      { path: "ownership", element: <OwnershipPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "graph", element: <GraphPage /> },
      { path: "comparison", element: <ComparisonPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
