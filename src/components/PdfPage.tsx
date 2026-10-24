import { useEffect, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

type PdfPageProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  pageRatio?: number;
};

function PdfPage({ pdf, pageNumber, pageRatio: extractedPageRatio }: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const pdfTextLayerRef = useRef<TextLayer | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [widthToHeightRatio, setWidthToHeightRatio] = useState(8.5 / 11);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || !containerWidth) return;

    let cancelled = false;
    let currentTask: RenderTask | null = null;

    async function renderPage() {
      try {
        const page = pageRef.current ?? await pdf.getPage(pageNumber);
        pageRef.current = page;
        if (cancelled) return;

        const textContent = await page.getTextContent();
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const width = Math.min(containerWidth, 920);
        const scale = width / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const textLayerContainer = textLayerRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !textLayerContainer || !context) {
          throw new Error('Your browser could not create a PDF page layer.');
        }

        setWidthToHeightRatio(baseViewport.width / baseViewport.height);
        setError(null);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        textLayerContainer.replaceChildren();
        textLayerContainer.style.width = `${viewport.width}px`;
        textLayerContainer.style.height = `${viewport.height}px`;
        textLayerContainer.style.setProperty('--scale-factor', `${scale}`);
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerContainer,
          viewport,
        });
        pdfTextLayerRef.current = textLayer;

        currentTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        renderTaskRef.current = currentTask;
        await Promise.all([currentTask.promise, textLayer.render()]);
      } catch (renderError) {
        if (!cancelled && !(renderError instanceof Error && renderError.name === 'RenderingCancelledException')) {
          setError(renderError instanceof Error ? renderError.message : 'This page could not be rendered.');
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      currentTask?.cancel();
      pdfTextLayerRef.current?.cancel();
      pdfTextLayerRef.current = null;
      renderTaskRef.current = null;
    };
  }, [containerWidth, nearViewport, pageNumber, pdf]);

  return (
    <section
      ref={containerRef}
      className="page-shell"
      data-page-number={pageNumber}
      style={{ aspectRatio: `${extractedPageRatio ?? widthToHeightRatio}` }}
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="pdf-text-layer textLayer" />
      {error && <p className="page-error" role="alert">{error}</p>}
    </section>
  );
}

export default PdfPage;
