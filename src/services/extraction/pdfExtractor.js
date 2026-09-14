import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { env } from '../../config/env.js';
import { cleanExtractedText } from '../../utils/text.js';
import { ocrImage } from './ocrService.js';

// PDF.js' Node factories expect a filesystem directory for built-in resources.
// A file:// URL can produce repeated "Unable to load font data" warnings on
// Windows. Keep a trailing separator because PDF.js appends resource filenames.
function resourcePath(relativeDir) {
  // PDF.js validates these resource locations as URL-like base strings and
  // specifically requires a forward-slash terminator. Windows path.sep is
  // a backslash, so normalize the absolute filesystem path to forward slashes.
  return path.resolve('node_modules', 'pdfjs-dist', relativeDir).replaceAll('\\', '/') + '/';
}

async function digitalText(page) {
  const content = await page.getTextContent();
  return cleanExtractedText(content.items
    .filter((item) => typeof item.str === 'string')
    .map((item) => item.str)
    .join(' '));
}

async function renderPageToPng(page, pdf) {
  const viewport = page.getViewport({ scale: env.pdfOcrRenderScale });
  const factory = pdf.canvasFactory;
  const canvasAndContext = factory.create(viewport.width, viewport.height);
  try {
    await page.render({ canvasContext: canvasAndContext.context, viewport }).promise;
    const canvas = canvasAndContext.canvas;
    if (typeof canvas.encode === 'function') return await canvas.encode('png');
    if (typeof canvas.toBuffer === 'function') return canvas.toBuffer('image/png');
    throw new Error('PDF.js canvas cannot be encoded for OCR.');
  } finally {
    factory.destroy(canvasAndContext);
  }
}

export async function extractPdf(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: resourcePath('standard_fonts'),
    cMapUrl: resourcePath('cmaps'),
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  const ocrPages = [];
  let ocrAttempted = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      let text = await digitalText(page);
      if (env.ocrEnabled && text.length < env.pdfOcrPageMinChars && ocrAttempted < env.pdfOcrMaxPages) {
        ocrAttempted += 1;
        const png = await renderPageToPng(page, pdf);
        const ocr = await ocrImage(png);
        if (ocr.text.length > text.length) {
          text = ocr.text;
          ocrPages.push(pageNumber);
        }
      }
      if (text) pages.push(`[Page ${pageNumber}]\n${text}`);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return {
    text: cleanExtractedText(pages.join('\n\n')),
    method: ocrPages.length ? 'pdf-hybrid-text-and-ocr' : 'pdf-text',
    pages: pdf.numPages,
    ocrUsed: ocrPages.length > 0,
    ocrPages,
  };
}
