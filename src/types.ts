export interface WordBox {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface LineBox {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface OcrData {
  text: string;
  words: WordBox[];
  lines: LineBox[];
  confidence: number;
}

export interface PageImageVariant {
  originalDataUrl: string;
  processedDataUrl: string;
  width: number;
  height: number;
  processed: boolean;
}

export interface PdfPageItem {
  id: string;
  index: number;
  width: number;
  height: number;
  thumbnailDataUrl: string;
  previewDataUrl: string;
  image: PageImageVariant;
  ocr: OcrData | null;
  editedText: string;
  status: 'idle' | 'processing' | 'done' | 'error' | 'cancelled';
  progress: number;
  error?: string;
}

export interface LoadedPdfDocument {
  fileName: string;
  fileSize: number;
  originalBytes: Uint8Array;
  pages: PdfPageItem[];
}

export interface ExportJsonPayload {
  version: number;
  fileName: string;
  exportedAt: string;
  pageCount: number;
  pages: Array<{
    index: number;
    width: number;
    height: number;
    text: string;
    status: PdfPageItem['status'];
    ocr: OcrData | null;
  }>;
}

export interface OcrOptions {
  language: string;
  preprocessImage: boolean;
}

export interface OcrProgressEvent {
  pageIndex: number;
  progress: number;
  status: string;
}
