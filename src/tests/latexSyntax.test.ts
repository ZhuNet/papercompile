import { describe, expect, it } from 'vitest';
import { highlightLatex } from '../latexSyntax';

describe('highlightLatex', () => {
  it('highlights LaTeX commands, braces, options, and comments', () => {
    const html = highlightLatex('\\section[Short]{Title} % note');
    expect(html).toContain('<span class="syntax-command">\\section</span>');
    expect(html).toContain('<span class="syntax-option">[Short]</span>');
    expect(html).toContain('<span class="syntax-brace">{</span>');
    expect(html).toContain('<span class="syntax-comment">% note</span>');
  });

  it('escapes source before adding markup', () => {
    expect(highlightLatex('a < b & c')).toContain('a &lt; b &amp; c');
  });
});
