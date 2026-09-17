import { highlightLatex } from './latexSyntax';

export type TextLanguage = 'latex' | 'bibtex' | 'markdown' | 'json' | 'yaml' | 'toml' | 'plain';

type TextLanguageInfo = { language: TextLanguage; label: string };

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function textLanguageForPath(path: string): TextLanguageInfo {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (['tex', 'sty', 'cls', 'bst'].includes(extension)) return { language: 'latex', label: 'LaTeX 源码' };
  if (extension === 'bib') return { language: 'bibtex', label: 'BibTeX 源码' };
  if (extension === 'md') return { language: 'markdown', label: 'Markdown 文档' };
  if (extension === 'json') return { language: 'json', label: 'JSON 文档' };
  if (extension === 'yaml' || extension === 'yml') return { language: 'yaml', label: 'YAML 文档' };
  if (extension === 'toml') return { language: 'toml', label: 'TOML 文档' };
  if (extension === 'txt') return { language: 'plain', label: '纯文本文档' };
  return { language: 'plain', label: '文本文件' };
}

function highlightMarkdown(source: string): string {
  return escapeHtml(source).split('\n').map((line) => {
    let highlighted = line
      .replace(/(`[^`]*`)/g, '<span class="syntax-code">$1</span>')
      .replace(/(\[[^\]]+\]\([^\s)]+\))/g, '<span class="syntax-link">$1</span>')
      .replace(/^(\s*(?:[-*+] |\d+\. ))/, '<span class="syntax-list">$1</span>')
      .replace(/^(\s*&gt;\s*)/, '<span class="syntax-quote">$1</span>');
    highlighted = highlighted.replace(/^(#{1,6}\s.*)$/, '<span class="syntax-heading">$1</span>');
    return highlighted;
  }).join('\n');
}

function highlightJson(source: string): string {
  return escapeHtml(source).replace(
    /(&quot;(?:\\.|[^&])*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
    (match, stringValue: string | undefined, colon: string | undefined, literal: string | undefined) => {
      if (stringValue) return `<span class="${colon ? 'syntax-key' : 'syntax-string'}">${stringValue}</span>${colon ?? ''}`;
      if (literal) return `<span class="syntax-literal">${match}</span>`;
      return `<span class="syntax-number">${match}</span>`;
    },
  );
}

function highlightKeyValue(source: string, language: 'yaml' | 'toml'): string {
  return escapeHtml(source).split('\n').map((line) => {
    if (/^\s*[#;]/.test(line)) return `<span class="syntax-comment">${line}</span>`;
    if (language === 'toml' && /^\s*\[.*\]\s*$/.test(line)) return `<span class="syntax-heading">${line}</span>`;
    return line
      .replace(/^(\s*[A-Za-z0-9_.-]+)(\s*[:=])/, '<span class="syntax-key">$1</span>$2')
      .replace(/(&quot;[^&]*?&quot;|'[^']*?')/g, '<span class="syntax-string">$1</span>')
      .replace(/\b(true|false|null|[-+]?\d+(?:\.\d+)?)\b/g, '<span class="syntax-literal">$1</span>');
  }).join('\n');
}

function highlightBibtex(source: string): string {
  return escapeHtml(source).split('\n').map((line) => line
    .replace(/^(@[A-Za-z]+)(\s*\{)/, '<span class="syntax-command">$1</span>$2')
    .replace(/^(\s*[A-Za-z][\w-]*)(\s*=)/, '<span class="syntax-key">$1</span>$2')
    .replace(/(%.*)$/, '<span class="syntax-comment">$1</span>'))
    .join('\n');
}

export function highlightText(source: string, language: TextLanguage): string {
  if (language === 'latex') return highlightLatex(source);
  if (language === 'markdown') return highlightMarkdown(source);
  if (language === 'json') return highlightJson(source);
  if (language === 'yaml' || language === 'toml') return highlightKeyValue(source, language);
  if (language === 'bibtex') return highlightBibtex(source);
  return escapeHtml(source);
}
