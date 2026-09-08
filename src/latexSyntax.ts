const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function highlightLatex(source: string): string {
  const escaped = escapeHtml(source);
  return escaped
    .replace(/(%[^\n]*)/g, '<span class="syntax-comment">$1</span>')
    .replace(/(\\[a-zA-Z@]+\*?)/g, '<span class="syntax-command">$1</span>')
    .replace(/([{}])/g, '<span class="syntax-brace">$1</span>')
    .replace(/(\[[^\]]*\])/g, '<span class="syntax-option">$1</span>')
    .replace(/(&quot;[^&quot;]*&quot;)/g, '<span class="syntax-string">$1</span>');
}
