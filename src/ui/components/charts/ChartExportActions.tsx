import { Download, Image as ImageIcon } from 'lucide-react';
import { exportSvgAsPng, exportSvgElement } from '../../utils/chartExport.ts';

interface ChartExportActionsProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  title: string;
}

export function ChartExportActions({ svgRef, title }: ChartExportActionsProps) {
  return (
    <div className="chart-export-bar no-print">
      <button
        type="button"
        className="chart-export-btn"
        onClick={() => exportSvgElement(svgRef.current, title)}
        title="Unduh grafik vektor (.svg)"
        aria-label={`Unduh SVG ${title}`}
      >
        <Download size={11} /> SVG
      </button>
      <button
        type="button"
        className="chart-export-btn"
        onClick={() => exportSvgAsPng(svgRef.current, title, 2)}
        title="Unduh gambar resolusi tinggi (.png 2x)"
        aria-label={`Unduh PNG ${title}`}
      >
        <ImageIcon size={11} /> PNG
      </button>
    </div>
  );
}
