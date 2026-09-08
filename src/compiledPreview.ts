export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function compileSources(files: { path: string; content?: string | null }[]): { path: string; content: string }[] {
  return files.flatMap((file) => typeof file.content === 'string' && file.path.toLowerCase().endsWith('.tex')
    ? [{ path: file.path, content: file.content }]
    : []);
}

export function compileFailureText(
  compiler: string,
  diagnostics: { file: string; line?: number; message: string }[],
  log: string,
): string {
  const details = diagnostics.length
    ? diagnostics.map((item) => `${item.file}${item.line ? `:${item.line}` : ''}\n${item.message}`).join('\n\n')
    : log.trim();
  return `${compiler} 编译失败${details ? `\n\n${details}` : ''}`;
}

export function pageSizeAtZoom(width: number, height: number, zoom: number) {
  const scale = zoom / 100;
  return { width: width * scale, height: height * scale, scale };
}

export function zoomFromWheel(current: number, deltaY: number, ctrlKey: boolean): number {
  if (!ctrlKey || deltaY === 0) return current;
  return Math.max(25, Math.min(500, current + (deltaY < 0 ? 10 : -10)));
}

export function currentPageFromPositions(scrollTop: number, viewportHeight: number, pageTops: number[]): number {
  if (!pageTops.length) return 0;
  const readingPosition = scrollTop + viewportHeight * 0.35;
  let page = 1;
  for (let index = 1; index < pageTops.length; index += 1) {
    if (pageTops[index] > readingPosition) break;
    page = index + 1;
  }
  return page;
}

export function clampPage(page: number, total: number): number {
  if (total < 1) return 0;
  return Math.max(1, Math.min(total, Math.trunc(page) || 1));
}

export function paginateText(text: string, linesPerPage = 42): string[] {
  const lines = text.split(/\r?\n/);
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage).join('\n'));
  }
  return pages.length ? pages : [''];
}
