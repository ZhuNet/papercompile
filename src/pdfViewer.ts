export function pdfDownloadName(entryFile: string): string {
  const filename = entryFile.replaceAll('\\', '/').split('/').pop() ?? '';
  const stem = filename.replace(/\.[^.]*$/, '');
  return `${stem || 'document'}.pdf`;
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
