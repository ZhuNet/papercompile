import { describe, expect, it } from 'vitest';
import { clampPage, compileFailureText, compileSources, currentPageFromPositions, decodeBase64, paginateText, pageSizeAtZoom, zoomFromWheel } from './compiledPreview';

describe('decodeBase64', () => {
  it('turns compiler PDF data into browser bytes', () => {
    expect([...decodeBase64('JVBERg==')]).toEqual([37, 80, 68, 70]);
  });
});

describe('compileSources', () => {
  it('keeps only project files whose content is a string', () => {
    expect(compileSources([
      { path: 'main.tex', content: '\\documentclass{article}' },
      { path: 'empty.tex', content: '' },
      { path: 'references.bib', content: '@article{x}' },
      { path: 'figure.png', content: null },
      { path: 'missing.bin' },
    ])).toEqual([
      { path: 'main.tex', content: '\\documentclass{article}' },
      { path: 'empty.tex', content: '' },
    ]);
  });
});

describe('compileFailureText', () => {
  it('renders compiler diagnostics as正文 text without a diagnostic count', () => {
    expect(compileFailureText('XeLaTeX', [
      { file: 'main.tex', line: 12, message: 'Undefined control sequence' },
      { file: 'refs.bib', message: 'Missing field' },
    ], 'raw log')).toBe('XeLaTeX 编译失败\n\nmain.tex:12\nUndefined control sequence\n\nrefs.bib\nMissing field');
  });

  it('falls back to the compiler log when no structured diagnostic is available', () => {
    expect(compileFailureText('XeLaTeX', [], 'fatal compiler output')).toBe('XeLaTeX 编译失败\n\nfatal compiler output');
  });

  it('paginates compiler output without dropping lines', () => {
    const text = Array.from({ length: 7 }, (_, index) => `line ${index + 1}`).join('\n');
    expect(paginateText(text, 3)).toEqual([
      'line 1\nline 2\nline 3',
      'line 4\nline 5\nline 6',
      'line 7',
    ]);
  });
});

describe('PDF preview sizing', () => {
  it('scales both page dimensions by the same factor', () => {
    expect(pageSizeAtZoom(595, 842, 125)).toEqual({ width: 743.75, height: 1052.5, scale: 1.25 });
  });

  it('zooms only for ctrl-wheel and clamps the supported range', () => {
    expect(zoomFromWheel(100, -1, false)).toBe(100);
    expect(zoomFromWheel(100, -1, true)).toBe(110);
    expect(zoomFromWheel(100, 1, true)).toBe(90);
    expect(zoomFromWheel(500, -1, true)).toBe(500);
    expect(zoomFromWheel(25, 1, true)).toBe(25);
  });

  it('reports the page nearest the viewport reading position', () => {
    expect(currentPageFromPositions(0, 600, [40, 900, 1760])).toBe(1);
    expect(currentPageFromPositions(760, 600, [40, 900, 1760])).toBe(2);
    expect(currentPageFromPositions(1650, 600, [40, 900, 1760])).toBe(3);
  });

  it('clamps requested pages for viewer navigation', () => {
    expect(clampPage(0, 8)).toBe(1);
    expect(clampPage(4, 8)).toBe(4);
    expect(clampPage(99, 8)).toBe(8);
  });
});
