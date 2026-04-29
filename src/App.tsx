import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { OverviewPage } from "@/pages/Overview";
import { HeatmapPage } from "@/pages/HeatmapPage";
import { TimelinePage } from "@/pages/TimelinePage";
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
      { path: "comparison", element: <ComparisonPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
