import { triggerDownload } from '../../io/exporters/excelExporter.ts';

function resolveCssVars(raw: string, rootStyles: CSSStyleDeclaration): string {
  return raw.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g, (_match, varName: string) => {
    const val = rootStyles.getPropertyValue(varName).trim();
    return val || '#334155';
  });
}

function buildStandaloneSvgString(svgEl: SVGSVGElement): { svgString: string; width: number; height: number } {
  const rootStyles = getComputedStyle(document.documentElement);
  const bgSurface = rootStyles.getPropertyValue('--bg-surface').trim() || '#ffffff';
  const fontSans =
    rootStyles.getPropertyValue('--font-sans').trim() || 'system-ui, -apple-system, sans-serif';
  const fontMono = rootStyles.getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace';

  const vb = svgEl.viewBox.baseVal;
  const rect = svgEl.getBoundingClientRect();
  const width = vb && vb.width > 0 ? vb.width : Math.max(400, Math.round(rect.width) || 600);
  const height = vb && vb.height > 0 ? vb.height : Math.max(200, Math.round(rect.height) || 260);

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Strip interactive-only overlay markers if tagged
  clone.querySelectorAll('[data-export-ignore="true"]').forEach((node) => node.remove());

  // Inject crisp background rect and embedded font styles
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    text { font-family: ${fontSans}; }
    .mono-num { font-family: ${fontMono}; font-variant-numeric: tabular-nums; }
  `;
  clone.insertBefore(styleEl, clone.firstChild);

  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', String(width));
  bgRect.setAttribute('height', String(height));
  bgRect.setAttribute('fill', bgSurface);
  clone.insertBefore(bgRect, styleEl.nextSibling);

  const serialized = new XMLSerializer().serializeToString(clone);
  const resolved = resolveCssVars(serialized, rootStyles);
  return { svgString: resolved, width, height };
}

function sanitizeFileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'omniqm_chart'
  );
}

export function exportSvgElement(svgEl: SVGSVGElement | null, title: string): void {
  if (!svgEl) return;
  const { svgString } = buildStandaloneSvgString(svgEl);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, `${sanitizeFileSlug(title)}.svg`);
}

export function exportSvgAsPng(svgEl: SVGSVGElement | null, title: string, scale = 2): void {
  if (!svgEl) return;
  const { svgString, width, height } = buildStandaloneSvgString(svgEl);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            triggerDownload(pngBlob, `${sanitizeFileSlug(title)}.png`);
          }
        }, 'image/png');
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
  };

  img.src = url;
}
