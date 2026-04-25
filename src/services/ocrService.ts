import { createWorker, type RecognizeResult, type Worker } from 'tesseract.js';
import type { OcrData, OcrOptions, OcrProgressEvent, LineBox, WordBox } from '../types';

type ProgressCallback = (event: OcrProgressEvent) => void;

export class OcrService {
  private worker: Worker | null = null;
  private cancelled = false;
  private onProgress?: ProgressCallback;
  private activePageIndex = -1;

  async ensureWorker(language: string, onProgress?: ProgressCallback): Promise<void> {
    this.onProgress = onProgress;

    if (this.worker) {
      return;
    }

    this.worker = await createWorker(language, 1, {
      logger: (message) => {
        if (!this.onProgress || this.cancelled) {
          return;
        }

        if (typeof message.progress === 'number') {
          this.onProgress({
            pageIndex: this.activePageIndex,
            progress: message.progress,
            status: message.status,
          });
        }
      },
    });
  }

  async recognizePage(
    pageIndex: number,
    dataUrl: string,
    options: OcrOptions,
    onProgress?: ProgressCallback,
  ): Promise<OcrData> {
    this.cancelled = false;
    this.onProgress = onProgress;
    this.activePageIndex = pageIndex;
    await this.ensureWorker(options.language, onProgress);

    if (!this.worker) {
      throw new Error('Worker OCR indisponible.');
    }

    const result = await this.worker.recognize(dataUrl);

    if (this.cancelled) {
      throw new Error('OCR annule.');
    }

    if (onProgress) {
      onProgress({
        pageIndex,
        progress: 1,
        status: 'done',
      });
    }

    return normalizeResult(result);
  }

  cancel(): void {
    this.cancelled = true;
    if (this.worker) {
      void this.worker.terminate();
      this.worker = null;
    }
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

function normalizeResult(result: RecognizeResult): OcrData {
  const words: WordBox[] = [];
  const lines: LineBox[] = [];

  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        lines.push({
          text: line.text,
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1,
          },
        });

        for (const word of line.words) {
          words.push({
            text: word.text,
            confidence: word.confidence,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            },
          });
        }
      }
    }
  }

  return {
    text: result.data.text,
    words,
    lines,
    confidence: result.data.confidence ?? 0,
  };
}
