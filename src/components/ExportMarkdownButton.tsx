import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { copyMarkdown } from "@/lib/exportMarkdown";

interface Props {
  /** Lazily build the markdown payload — keeps heavy formatting out of every render. */
  build: () => string;
  disabled?: boolean;
}

export function ExportMarkdownButton({ build, disabled }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await copyMarkdown(build());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("copy markdown failed", err);
      alert(String(err));
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      title={t("common.copyMarkdown")}
      aria-label={t("common.copyMarkdown")}
      disabled={disabled}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </Button>
  );
}
