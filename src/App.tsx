import { lazy } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

import { AppShell } from "@/components/AppShell";

const HomePage = lazy(() =>
  import("@/pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const CommitDetailPage = lazy(() =>
  import("@/pages/CommitDetailPage").then((m) => ({
    default: m.CommitDetailPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const SearchPage = lazy(() =>
  import("@/pages/SearchPage").then((m) => ({ default: m.SearchPage })),
);
const ComparisonPage = lazy(() =>
  import("@/pages/ComparisonPage").then((m) => ({ default: m.ComparisonPage })),
);

// Activity section
const ActivitySection = lazy(() =>
  import("@/pages/sections/ActivitySection").then((m) => ({
    default: m.ActivitySection,
  })),
);
const HeatmapPage = lazy(() =>
  import("@/pages/HeatmapPage").then((m) => ({ default: m.HeatmapPage })),
);
const TimelinePage = lazy(() =>
  import("@/pages/TimelinePage").then((m) => ({ default: m.TimelinePage })),
);
const PatternsPage = lazy(() =>
  import("@/pages/PatternsPage").then((m) => ({ default: m.PatternsPage })),
);

// Insights section
const InsightsSection = lazy(() =>
  import("@/pages/sections/InsightsSection").then((m) => ({
    default: m.InsightsSection,
  })),
);
const HealthPage = lazy(() =>
  import("@/pages/HealthPage").then((m) => ({ default: m.HealthPage })),
);
const HotspotsPage = lazy(() =>
  import("@/pages/HotspotsPage").then((m) => ({ default: m.HotspotsPage })),
);
const OwnershipPage = lazy(() =>
  import("@/pages/OwnershipPage").then((m) => ({ default: m.OwnershipPage })),
);
const ContributorsPage = lazy(() =>
  import("@/pages/ContributorsPage").then((m) => ({
    default: m.ContributorsPage,
  })),
);
const MessagesPage = lazy(() =>
  import("@/pages/MessagesPage").then((m) => ({ default: m.MessagesPage })),
);
const CollaboratorsPage = lazy(() =>
  import("@/pages/CollaboratorsPage").then((m) => ({
    default: m.CollaboratorsPage,
  })),
);
const QualityPage = lazy(() =>
  import("@/pages/QualityPage").then((m) => ({ default: m.QualityPage })),
);
const RepoConfigPage = lazy(() =>
  import("@/pages/RepoConfigPage").then((m) => ({
    default: m.RepoConfigPage,
  })),
);
const TagOverviewPage = lazy(() =>
  import("@/pages/TagOverviewPage").then((m) => ({
    default: m.TagOverviewPage,
  })),
);
const ContributorDetailPage = lazy(() =>
  import("@/pages/ContributorDetailPage").then((m) => ({
    default: m.ContributorDetailPage,
  })),
);

// Graph section
const GraphSection = lazy(() =>
  import("@/pages/sections/GraphSection").then((m) => ({
    default: m.GraphSection,
  })),
);
const GraphPage = lazy(() =>
  import("@/pages/GraphPage").then((m) => ({ default: m.GraphPage })),
);

const CouplingsGraphPage = lazy(() =>
  import("@/pages/CouplingsGraphPage").then((m) => ({
    default: m.CouplingsGraphPage,
  })),
);

const OwnershipMapPage = lazy(() =>
  import("@/pages/OwnershipMapPage").then((m) => ({
    default: m.OwnershipMapPage,
  })),
);

const ImportGraphPage = lazy(() =>
  import("@/pages/ImportGraphPage").then((m) => ({
    default: m.ImportGraphPage,
  })),
);
const BranchesPage = lazy(() =>
  import("@/pages/BranchesPage").then((m) => ({ default: m.BranchesPage })),
);
const TagsPage = lazy(() =>
  import("@/pages/TagsPage").then((m) => ({ default: m.TagsPage })),
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "search", element: <SearchPage /> },
      { path: "compare", element: <ComparisonPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "commits/:oid", element: <CommitDetailPage /> },
      { path: "contributors/:email", element: <ContributorDetailPage /> },
      { path: "tags/:id", element: <TagOverviewPage /> },

      {
        path: "activity",
        element: <ActivitySection />,
        children: [
          { index: true, element: <Navigate to="heatmap" replace /> },
          { path: "heatmap", element: <HeatmapPage /> },
          { path: "timeline", element: <TimelinePage /> },
          { path: "patterns", element: <PatternsPage /> },
        ],
      },
      {
        path: "insights",
        element: <InsightsSection />,
        children: [
          { index: true, element: <Navigate to="health" replace /> },
          { path: "health", element: <HealthPage /> },
          { path: "hotspots", element: <HotspotsPage /> },
          { path: "ownership", element: <OwnershipPage /> },
          { path: "authors", element: <ContributorsPage /> },
          { path: "messages", element: <MessagesPage /> },
          { path: "collaborators", element: <CollaboratorsPage /> },
          { path: "quality", element: <QualityPage /> },
        ],
      },
      {
        path: "repo",
        children: [
          { index: true, element: <Navigate to="config" replace /> },
          { path: "config", element: <RepoConfigPage /> },
        ],
      },
      {
        path: "graph",
        element: <GraphSection />,
        children: [
          { index: true, element: <Navigate to="dag" replace /> },
          { path: "dag", element: <GraphPage /> },
          { path: "branches", element: <BranchesPage /> },
          { path: "releases", element: <TagsPage /> },
          { path: "couplings", element: <CouplingsGraphPage /> },
          { path: "ownership-map", element: <OwnershipMapPage /> },
          { path: "imports", element: <ImportGraphPage /> },
        ],
      },

      // Backward-compat redirects
      { path: "overview", element: <Navigate to="/activity" replace /> },
      { path: "comparison", element: <Navigate to="/compare" replace /> },
      { path: "heatmap", element: <Navigate to="/activity/heatmap" replace /> },
      { path: "timeline", element: <Navigate to="/activity/timeline" replace /> },
      { path: "branches", element: <Navigate to="/graph/branches" replace /> },
      { path: "tags", element: <Navigate to="/graph/releases" replace /> },
      { path: "contributors", element: <Navigate to="/insights/authors" replace /> },
      { path: "insights/config", element: <Navigate to="/repo/config" replace /> },
      { path: "ownership", element: <Navigate to="/insights/ownership" replace /> },
      { path: "hotspots", element: <Navigate to="/insights/hotspots" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
