import { describe, expect, it } from 'vitest';
import {
  BlobPdfSource,
  compiledPdfDocument,
  normalizePdfReadingState,
  pdfDownloadName,
  saveCompiledPdf,
} from './pdfViewer';

describe('pdfDownloadName', () => {
  it('uses the LaTeX entry filename for the compiled PDF download', () => {
    expect(pdfDownloadName('chapters/main.tex')).toBe('main.pdf');
  });

  it('falls back to a stable filename when no entry file is available', () => {
    expect(pdfDownloadName('')).toBe('document.pdf');
  });
});

describe('BlobPdfSource', () => {
  it('releases the previous PDF URL when a new compilation is loaded', () => {
    const revoked: string[] = [];
    let nextUrl = 0;
    const source = new BlobPdfSource(
      () => `blob:pdf-${++nextUrl}`,
      (url) => revoked.push(url),
    );

    expect(source.replace(new Uint8Array([1]))).toBe('blob:pdf-1');
    expect(source.replace(new Uint8Array([2]))).toBe('blob:pdf-2');
    expect(revoked).toEqual(['blob:pdf-1']);
  });

  it('releases the active PDF URL when the viewer is disposed', () => {
    const revoked: string[] = [];
    const source = new BlobPdfSource(() => 'blob:active', (url) => revoked.push(url));

    source.replace(new Uint8Array([1]));
    source.dispose();

    expect(revoked).toEqual(['blob:active']);
  });
});

describe('normalizePdfReadingState', () => {
  it('keeps the page, page offset, and scale for a refreshed PDF', () => {
    expect(normalizePdfReadingState({ page: 4, pageOffset: 180, scale: '1.5' }, 8)).toEqual({
      page: 4,
      pageOffset: 180,
      scale: '1.5',
    });
  });

  it('clamps the restored page when the refreshed PDF has fewer pages', () => {
    expect(normalizePdfReadingState({ page: 9, pageOffset: 40, scale: 'page-width' }, 3)).toEqual({
      page: 3,
      pageOffset: 40,
      scale: 'page-width',
    });
  });
});

describe('compiledPdfDocument', () => {
  it('gives every successful compilation a new viewer identity', () => {
    const data = new Uint8Array([1, 2, 3]);

    expect(compiledPdfDocument(data, 4)).toEqual({ data, revision: 5 });
  });
});

describe('saveCompiledPdf', () => {
  it('writes the current PDF to the path selected by the user', async () => {
    const writes: { path: string; data: number[] }[] = [];

    const saved = await saveCompiledPdf(
      new Uint8Array([37, 80, 68, 70]),
      'main.pdf',
      async () => 'C:\\papers\\main.pdf',
      async (path, data) => { writes.push({ path, data }); },
    );

    expect(saved).toBe(true);
    expect(writes).toEqual([{ path: 'C:\\papers\\main.pdf', data: [37, 80, 68, 70] }]);
  });

  it('does not write when the save dialog is cancelled', async () => {
    let wrote = false;

    const saved = await saveCompiledPdf(
      new Uint8Array([1]),
      'main.pdf',
      async () => null,
      async () => { wrote = true; },
    );

    expect(saved).toBe(false);
    expect(wrote).toBe(false);
  });
});
