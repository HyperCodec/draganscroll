import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractText } from '../lib/extractText';
import { buildSections } from '../lib/sections';
import type { ReadingSection } from '../types';
import { useCheckpoints } from '../hooks/useCheckpoints';
import PdfPage from './PdfPage';

GlobalWorkerOptions.workerSrc = pdfWorker;

type PdfViewerProps = {
  file: File;
  onBack: () => void;
  onError: (message: string) => void;
};

function PdfViewer({ file, onBack, onError }: PdfViewerProps) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [textLoading, setTextLoading] = useState(false);
  const [noTextLayer, setNoTextLayer] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [sections, setSections] = useState<ReadingSection[]>([]);
  const [pageRatios, setPageRatios] = useState<number[]>([]);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
  const { markers, currentSection } = useCheckpoints(sections, pagesContainerRef);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    async function loadPdf() {
      window.scrollTo(0, 0);
      setLoading(true);
      setDocument(null);
      setPageRatios([]);

      try {
        const bytes = await file.arrayBuffer();
        if (!active) return;
        loadingTask = getDocument({ data: bytes });
        const loadedDocument = await loadingTask.promise;
        if (active) {
          setDocument(loadedDocument);
          setLoading(false);
        }
      } catch (error) {
        if (active) {
          onError(
            error instanceof Error
              ? `This PDF couldn't be opened: ${error.message}`
              : 'This PDF couldn’t be opened. Try another file.',
          );
        }
      }
    }

    void loadPdf();

    return () => {
      active = false;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [file, onError]);

  useEffect(() => {
    if (!document) return;
    const pdf = document;
    let active = true;
    setTextLoading(true);
    setNoTextLayer(false);
    setTextError(null);
    setSections([]);

    async function readText() {
      try {
        const extracted = await extractText(pdf);
        if (!active) return;
        setPageRatios(extracted.pages.map((page) => page.pageWidth / page.pageHeight));
        setNoTextLayer(extracted.noTextLayer);
        setSections(extracted.noTextLayer ? [] : buildSections(extracted.pages));
      } catch (error) {
        if (active) {
          setTextError(
            error instanceof Error
              ? `Text could not be read from this PDF: ${error.message}`
              : 'Text could not be read from this PDF.',
          );
        }
      } finally {
        if (active) setTextLoading(false);
      }
    }

    void readText();
    return () => {
      active = false;
    };
  }, [document]);

  return (
    <main className="reader-page">
      <header className="reader-header">
        <button className="back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>Library</span>
        </button>
        <div className="reader-title" title={file.name}>{file.name}</div>
        <div className="page-count">
          {document ? `${document.numPages} ${document.numPages === 1 ? 'page' : 'pages'}` : ''}
        </div>
      </header>

      {loading && <p className="reader-status">Opening your document…</p>}
      {textLoading && <p className="text-status">Preparing reading checkpoints…</p>}
      {noTextLayer && (
        <p className="text-banner" role="status">
          This PDF has no selectable text, so checkpoints are disabled.
        </p>
      )}
      {textError && <p className="text-banner" role="alert">{textError}</p>}
      {document && (
        <div className="pages-list" ref={pagesContainerRef}>
          {Array.from({ length: document.numPages }, (_, index) => (
            <PdfPage
              key={`${file.name}-${index + 1}`}
              pdf={document}
              pageNumber={index + 1}
              pageRatio={pageRatios[index]}
            />
          ))}
          {debugEnabled && markers.map((marker) => (
            <div
              key={marker.id}
              className="checkpoint-marker"
              style={{ top: `${marker.top}px` }}
              aria-hidden="true"
            >
              <span title={`Checkpoint: ${marker.checkpointWords}`}>
                Section {marker.sectionNumber} end · {marker.checkpointWords}
              </span>
            </div>
          ))}
        </div>
      )}
      {debugEnabled && (
        <aside className="checkpoint-debug-status" aria-live="polite">
          {currentSection > 0
            ? `Section ${currentSection} · ${sections[currentSection - 1]?.wordCount ?? 0} words`
            : 'No text sections'}
        </aside>
      )}
    </main>
  );
}

export default PdfViewer;
