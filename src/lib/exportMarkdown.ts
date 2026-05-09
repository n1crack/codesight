/** Copy markdown text to the system clipboard, with a graceful fallback. */
export async function copyMarkdown(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for very old browsers — no harm running the modern path first.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

/** Escape `|`, backticks and pipe-breaking newlines so a value is safe inside a table cell. */
export function mdCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .replace(/`/g, "\\`");
}

/** Build a GitHub-flavored markdown table from a header + rows. */
export function mdTable(
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const head = `| ${header.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((r) => `| ${r.map(mdCell).join(" | ")} |`)
    .join("\n");
  return rows.length === 0 ? `${head}\n${sep}` : `${head}\n${sep}\n${body}`;
}
