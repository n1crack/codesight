import { lazy } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/AppShell";

const HomePage = lazy(() =>
  import("@/pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const CommitDetailPage = lazy(() =>
  import("@/pages/CommitDetailPage").then((m) => ({
    default: m.CommitDetailPage,
  })),
);
const OverviewPage = lazy(() =>
  import("@/pages/Overview").then((m) => ({ default: m.OverviewPage })),
);
const HeatmapPage = lazy(() =>
  import("@/pages/HeatmapPage").then((m) => ({ default: m.HeatmapPage })),
);
const TimelinePage = lazy(() =>
  import("@/pages/TimelinePage").then((m) => ({ default: m.TimelinePage })),
);
const ActivityPage = lazy(() =>
  import("@/pages/ActivityPage").then((m) => ({ default: m.ActivityPage })),
);
const TagsPage = lazy(() =>
  import("@/pages/TagsPage").then((m) => ({ default: m.TagsPage })),
);
const BranchesPage = lazy(() =>
  import("@/pages/BranchesPage").then((m) => ({ default: m.BranchesPage })),
);
const ContributorsPage = lazy(() =>
  import("@/pages/ContributorsPage").then((m) => ({
    default: m.ContributorsPage,
  })),
);
const ContributorDetailPage = lazy(() =>
  import("@/pages/ContributorDetailPage").then((m) => ({
    default: m.ContributorDetailPage,
  })),
);
const OwnershipPage = lazy(() =>
  import("@/pages/OwnershipPage").then((m) => ({ default: m.OwnershipPage })),
);
const SearchPage = lazy(() =>
  import("@/pages/SearchPage").then((m) => ({ default: m.SearchPage })),
);
const GraphPage = lazy(() =>
  import("@/pages/GraphPage").then((m) => ({ default: m.GraphPage })),
);
const HotspotsPage = lazy(() =>
  import("@/pages/HotspotsPage").then((m) => ({ default: m.HotspotsPage })),
);
const ComparisonPage = lazy(() =>
  import("@/pages/ComparisonPage").then((m) => ({ default: m.ComparisonPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "commits/:oid", element: <CommitDetailPage /> },
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
      { path: "hotspots", element: <HotspotsPage /> },
      { path: "comparison", element: <ComparisonPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
