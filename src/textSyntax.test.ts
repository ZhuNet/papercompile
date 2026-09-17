import { describe, expect, it } from 'vitest';
import { highlightText, textLanguageForPath } from './textSyntax';

describe('textLanguageForPath', () => {
  it.each([
    ['main.tex', 'latex', 'LaTeX 源码'],
    ['references.bib', 'bibtex', 'BibTeX 源码'],
    ['README.md', 'markdown', 'Markdown 文档'],
    ['config.json', 'json', 'JSON 文档'],
    ['config.yaml', 'yaml', 'YAML 文档'],
    ['config.yml', 'yaml', 'YAML 文档'],
    ['Cargo.toml', 'toml', 'TOML 文档'],
    ['notes.txt', 'plain', '纯文本文档'],
  ])('recognizes %s as %s', (path, language, label) => {
    expect(textLanguageForPath(path)).toEqual({ language, label });
  });
});

describe('highlightText', () => {
  it('highlights representative Markdown syntax', () => {
    const html = highlightText('# Heading\n- [link](https://example.com)\n`code`', 'markdown');

    expect(html).toContain('syntax-heading');
    expect(html).toContain('syntax-list');
    expect(html).toContain('syntax-link');
    expect(html).toContain('syntax-code');
  });

  it('highlights representative JSON syntax', () => {
    const html = highlightText('{"enabled": true, "count": 2}', 'json');

    expect(html).toContain('syntax-key');
    expect(html).toContain('syntax-literal');
    expect(html).toContain('syntax-number');
  });

  it('escapes HTML before highlighting every language', () => {
    expect(highlightText('<script>alert(1)</script>', 'markdown')).not.toContain('<script>');
    expect(highlightText('<script>alert(1)</script>', 'markdown')).toContain('&lt;script&gt;');
  });
});
