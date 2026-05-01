/**
 * Export an SVG element as a PNG download.
 * Reads computed styles into inline attributes so theme colors survive serialization.
 */
export async function exportSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  scale = 2,
): Promise<void> {
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, cloned);

  const w = svg.viewBox.baseVal.width || svg.clientWidth || 600;
  const h = svg.viewBox.baseVal.height || svg.clientHeight || 400;

  cloned.setAttribute("width", String(w));
  cloned.setAttribute("height", String(h));
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // background fill — read from <body> for correct theme
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const bgRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  bgRect.setAttribute("x", "0");
  bgRect.setAttribute("y", "0");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", bg);
  cloned.insertBefore(bgRect, cloned.firstChild);

  const xml = new XMLSerializer().serializeToString(cloned);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("png export: image load failed"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("png export: 2d context unavailable");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    const a = document.createElement("a");
    a.download = filename;
    a.href = canvas.toDataURL("image/png");
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Walk the DOM tree and copy computed styles inline so PNG matches screen */
function inlineStyles(source: SVGElement, target: SVGElement): void {
  const sourceWalker = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT);
  const targetWalker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT);
  let s: Element | null = sourceWalker.currentNode as Element;
  let tt: Element | null = targetWalker.currentNode as Element;
  while (s && tt) {
    const cs = getComputedStyle(s);
    const fill = cs.fill;
    const stroke = cs.stroke;
    const strokeWidth = cs.strokeWidth;
    const fontSize = cs.fontSize;
    const fontFamily = cs.fontFamily;
    const opacity = cs.opacity;
    if (fill && fill !== "none") tt.setAttribute("fill", fill);
    if (stroke && stroke !== "none") tt.setAttribute("stroke", stroke);
    if (strokeWidth) tt.setAttribute("stroke-width", strokeWidth);
    if (fontSize) tt.setAttribute("font-size", fontSize);
    if (fontFamily) tt.setAttribute("font-family", fontFamily);
    if (opacity && opacity !== "1") tt.setAttribute("opacity", opacity);
    s = sourceWalker.nextNode() as Element | null;
    tt = targetWalker.nextNode() as Element | null;
  }
}
