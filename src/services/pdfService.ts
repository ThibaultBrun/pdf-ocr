import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { LoadedPdfDocument, PdfPageItem } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const MAX_FILE_SIZE_BYTES = 40 * 1024 * 1024;
const PREVIEW_SCALE = 1.8;
const THUMBNAIL_SCALE = 0.35;

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

async function renderPageData(
  page: pdfjsLib.PDFPageProxy,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; viewport: pdfjsLib.PageViewport }> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D indisponible dans ce navigateur.');
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return { canvas, viewport };
}

export async function loadPdfFile(file: File): Promise<LoadedPdfDocument> {
  if (file.type !== 'application/pdf') {
    throw new Error('Le fichier sélectionné n’est pas un PDF.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Le fichier dépasse la limite de 40 Mo pour cette version navigateur.');
  }

  const fileBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(fileBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: fileBytes });

  let pdfDocument: pdfjsLib.PDFDocumentProxy;

  try {
    pdfDocument = await loadingTask.promise;
  } catch {
    throw new Error('Impossible de lire ce PDF. Vérifiez qu’il n’est pas corrompu ou chiffré.');
  }

  const pages: PdfPageItem[] = [];

  for (let index = 1; index <= pdfDocument.numPages; index += 1) {
    const page = await pdfDocument.getPage(index);
    const preview = await renderPageData(page, PREVIEW_SCALE);
    const thumbnail = await renderPageData(page, THUMBNAIL_SCALE);

    pages.push({
      id: `page-${index}`,
      index: index - 1,
      width: preview.viewport.width,
      height: preview.viewport.height,
      thumbnailDataUrl: canvasToDataUrl(thumbnail.canvas),
      previewDataUrl: canvasToDataUrl(preview.canvas),
      image: {
        originalDataUrl: canvasToDataUrl(preview.canvas),
        processedDataUrl: canvasToDataUrl(preview.canvas),
        width: preview.canvas.width,
        height: preview.canvas.height,
        processed: false,
      },
      ocr: null,
      editedText: '',
      status: 'idle',
      progress: 0,
    });
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    originalBytes: fileBytes,
    pages,
  };
}

export function applyImagePreprocessing(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Canvas 2D indisponible dans ce navigateur.'));
        return;
      }

      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const contrasted = gray > 145 ? 255 : Math.max(0, gray - 50);
        data[i] = contrasted;
        data[i + 1] = contrasted;
        data[i + 2] = contrasted;
      }

      context.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Impossible de prétraiter l’image de la page.'));
    image.src = dataUrl;
  });
}

export function isBrowserSupported(): { supported: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!window.Worker) {
    issues.push('Web Workers indisponibles.');
  }

  if (!window.FileReader || !window.Blob || !window.URL) {
    issues.push('API fichier incomplète.');
  }

  if (!HTMLCanvasElement.prototype.toDataURL) {
    issues.push('Canvas non pris en charge.');
  }

  return {
    supported: issues.length === 0,
    issues,
  };
}
