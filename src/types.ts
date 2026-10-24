export type ExtractedTextItem = {
  text: string;
  x: number;
  y: number;
};

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  wordCount: number;
  textItems: ExtractedTextItem[];
  pageWidth: number;
  pageHeight: number;
};

export type SectionCheckpoint = {
  pageNumber: number;
  yOffset: number;
  pageHeight: number;
};

export type ReadingSection = {
  id: string;
  text: string;
  wordCount: number;
  startPage: number;
  endPage: number;
  checkpoint: SectionCheckpoint;
};

export type CheckpointMarker = {
  id: string;
  sectionNumber: number;
  wordCount: number;
  checkpointWords: string;
  top: number;
};
