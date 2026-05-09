import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { exportSvgAsPng } from "@/lib/exportPng";

interface Props {
  containerRef: React.RefObject<HTMLElement | null>;
  filename: string;
  disabled?: boolean;
  /** Pick which SVG to export when the container has multiple. Defaults to the first. */
  selector?: string;
  /** Override scale factor passed to exportSvgAsPng (default 2). */
  scale?: number;
}

export function ExportPngButton({
  containerRef,
  filename,
  disabled,
  selector = "svg",
  scale,
}: Props) {
  const { t } = useTranslation();

  const onClick = () => {
    const root = containerRef.current;
    if (!root) return;
    const svg = root.querySelector(selector);
    if (svg instanceof SVGSVGElement) {
      void exportSvgAsPng(svg, filename, scale);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      title={t("common.exportPng")}
      aria-label={t("common.exportPng")}
      disabled={disabled}
    >
      <Download size={14} />
    </Button>
  );
}
