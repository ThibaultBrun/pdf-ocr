import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ExportJsonPayload, LoadedPdfDocument, PdfPageItem } from '../types';

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function pageText(page: PdfPageItem): string {
  return page.editedText.trim();
}

function buildJsonPayload(document: LoadedPdfDocument): ExportJsonPayload {
  return {
    version: 1,
    fileName: document.fileName,
    exportedAt: new Date().toISOString(),
    pageCount: document.pages.length,
    pages: document.pages.map((page) => ({
      index: page.index,
      width: page.width,
      height: page.height,
      text: page.editedText,
      status: page.status,
      ocr: page.ocr,
    })),
  };
}

export function exportTxt(document: LoadedPdfDocument): void {
  const content = document.pages
    .map((page) => `--- Page ${page.index + 1} ---\n${pageText(page)}`)
    .join('\n\n');

  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${baseName(document.fileName)}.txt`);
}

export function exportJson(document: LoadedPdfDocument): void {
  const payload = JSON.stringify(buildJsonPayload(document), null, 2);
  downloadBlob(new Blob([payload], { type: 'application/json;charset=utf-8' }), `${baseName(document.fileName)}.json`);
}

export async function exportZip(document: LoadedPdfDocument, debugVisibleText: boolean): Promise<void> {
  const zip = new JSZip();
  const txt = document.pages
    .map((page) => `--- Page ${page.index + 1} ---\n${pageText(page)}`)
    .join('\n\n');
  const json = JSON.stringify(buildJsonPayload(document), null, 2);
  const pdfBytes = await buildOcrPdf(document, debugVisibleText);

  zip.file(`${baseName(document.fileName)}.txt`, txt);
  zip.file(`${baseName(document.fileName)}.json`, json);
  zip.file(`${baseName(document.fileName)}-ocr.pdf`, pdfBytes);

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${baseName(document.fileName)}-exports.zip`);
}

export async function exportPdf(document: LoadedPdfDocument, debugVisibleText: boolean): Promise<void> {
  const bytes = await buildOcrPdf(document, debugVisibleText);
  const safeBytes = new Uint8Array(bytes.byteLength);
  safeBytes.set(bytes);
  downloadBlob(new Blob([safeBytes], { type: 'application/pdf' }), `${baseName(document.fileName)}-ocr.pdf`);
}

async function buildOcrPdf(document: LoadedPdfDocument, debugVisibleText: boolean): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);

  for (const page of document.pages) {
    const pdfPage = output.addPage([page.width, page.height]);
    const imageBytes = await fetch(page.image.originalDataUrl).then((response) => response.arrayBuffer());
    const embeddedImage = await output.embedPng(imageBytes);

    pdfPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
    });

    if (!page.ocr) {
      continue;
    }

    const lineTexts = page.editedText.split(/\r?\n/);
    const lines = page.ocr.lines.length > 0 ? page.ocr.lines : [{
      text: page.editedText,
      bbox: {
        x0: 12,
        y0: 12,
        x1: page.image.width - 12,
        y1: page.image.height - 12,
      },
    }];

    lines.forEach((line, index) => {
      const text = lineTexts[index] ?? line.text;
      const boxHeight = Math.max(10, line.bbox.y1 - line.bbox.y0);
      const x = (line.bbox.x0 / page.image.width) * page.width;
      const y = page.height - (line.bbox.y1 / page.image.height) * page.height;
      const fontSize = Math.max(7, (boxHeight / page.image.height) * page.height);

      pdfPage.drawText(text || ' ', {
        x,
        y,
        size: fontSize,
        font,
        color: debugVisibleText ? rgb(0.85, 0.1, 0.1) : rgb(1, 1, 1),
        opacity: debugVisibleText ? 0.6 : 0,
      });
    });
  }

  return output.save();
}

function baseName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '') || 'document';
}

export function importSavedJson(content: string): ExportJsonPayload {
  const parsed = JSON.parse(content) as ExportJsonPayload;

  if (!Array.isArray(parsed.pages)) {
    throw new Error('JSON OCR invalide.');
  }

  return parsed;
}
