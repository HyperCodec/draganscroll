import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ExtractedPage, ExtractedTextItem } from '../types';

export type ExtractedDocumentText = {
  pages: ExtractedPage[];
  noTextLayer: boolean;
};

function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

export async function extractText(pdf: PDFDocumentProxy): Promise<ExtractedDocumentText> {
  const pages: ExtractedPage[] = [];
  let documentWordCount = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    const content = await page.getTextContent();
    const textItems: ExtractedTextItem[] = [];

    for (const item of content.items) {
      if (!('str' in item) || !('transform' in item) || !item.str.trim()) continue;

      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      textItems.push({
        text: item.str,
        x,
        y,
      });
    }

    // Group nearby baselines before sorting left-to-right within each visual line.
    const sortedItems = textItems.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: ExtractedTextItem[][] = [];
    for (const item of sortedItems) {
      const currentLine = lines.at(-1);
      if (currentLine && Math.abs(currentLine[0].y - item.y) <= 3) {
        currentLine.push(item);
      } else {
        lines.push([item]);
      }
    }
    const readingOrderItems = lines.flatMap((line) => line.sort((a, b) => a.x - b.x));

    const text = readingOrderItems.map((item) => item.text).join(' ');
    const wordCount = countWords(text);
    documentWordCount += wordCount;
    pages.push({ pageNumber, text, wordCount, textItems: readingOrderItems, pageWidth, pageHeight });
  }

  return { pages, noTextLayer: documentWordCount < 50 };
}
