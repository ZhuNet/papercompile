export function pdfDownloadName(entryFile: string): string {
  const filename = entryFile.replaceAll('\\', '/').split('/').pop() ?? '';
  const stem = filename.replace(/\.[^.]*$/, '');
  return `${stem || 'document'}.pdf`;
}

export type PdfReadingState = {
  page: number;
  pageOffset: number;
  scale: string;
};

export type CompiledPdfDocument = {
  data: Uint8Array<ArrayBuffer>;
  revision: number;
};

export function compiledPdfDocument(
  data: Uint8Array<ArrayBuffer>,
  previousRevision: number,
): CompiledPdfDocument {
  return { data, revision: previousRevision + 1 };
}

export function normalizePdfReadingState(
  state: PdfReadingState,
  totalPages: number,
): PdfReadingState {
  return {
    page: totalPages > 0 ? Math.max(1, Math.min(totalPages, Math.trunc(state.page) || 1)) : 1,
    pageOffset: Math.max(0, state.pageOffset),
    scale: state.scale || 'auto',
  };
}

export async function saveCompiledPdf(
  data: Uint8Array<ArrayBuffer>,
  filename: string,
  choosePath: (filename: string) => Promise<string | null>,
  write: (path: string, data: number[]) => Promise<void>,
): Promise<boolean> {
  const path = await choosePath(filename);
  if (!path) return false;
  await write(path, Array.from(data));
  return true;
}

export class BlobPdfSource {
  private currentUrl = '';

  constructor(
    private readonly createUrl = (blob: Blob) => URL.createObjectURL(blob),
    private readonly revokeUrl = (url: string) => URL.revokeObjectURL(url),
  ) {}

  replace(data: Uint8Array<ArrayBuffer>): string {
    this.dispose();
    this.currentUrl = this.createUrl(new Blob([data], { type: 'application/pdf' }));
    return this.currentUrl;
  }

  dispose(): void {
    if (!this.currentUrl) return;
    this.revokeUrl(this.currentUrl);
    this.currentUrl = '';
  }
}
