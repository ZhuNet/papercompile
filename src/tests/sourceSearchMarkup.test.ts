import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';

const sourceView = appSource.slice(appSource.indexOf('function SourceView'));

describe('source editor markup', () => {
  it('uses a compact source header and an unavailable-file state', () => {
    expect(sourceView).toContain('无法打开此文件');
    expect(sourceView).toContain('when={props.editable}');
    expect(sourceView).not.toContain('二进制资源 · 只读');
    expect(styles).toContain('height: 30px;');
    expect(styles).toContain('height: calc(100% - 30px);');
  });

  it('uses one native editable text layer with a line-number gutter', () => {
    expect(sourceView).toContain('contentEditable');
    expect(sourceView).toContain('class="source-line-numbers"');
    expect(sourceView).toContain('class="source-editor"');
    expect(sourceView).not.toContain('<textarea');
    expect(sourceView).not.toContain('<pre');
    expect(sourceView).not.toContain('highlightSourceMatches(');
  });

  it('separates the 16px toggle strip from the 4px resize edge', () => {
    expect(appSource).toContain('class="ai-dock-resize-edge"');
    expect(appSource).toContain('class="ai-dock-toggle"');
    expect(styles).toContain('grid-template-rows: 4px 16px minmax(0, 1fr);');
    expect(styles).toContain('.ai-dock-resize-edge { height: 4px;');
    expect(styles).toContain('.ai-dock-toggle { display: grid; width: 100%; height: 16px;');
  });

  it('keeps wrapped editing native and avoids replacing the text node', () => {
    expect(styles).toContain('white-space: pre-wrap;');
    expect(styles).toContain('overflow-wrap: anywhere;');
    expect(styles).toContain('overflow-x: hidden;');
    expect(styles).toContain('.source-editor[contenteditable="true"]');
    expect(sourceView).toContain('editor.textContent !== content');
    expect(sourceView).toContain('onPaste');
  });

  it('uses one 44px topbar', () => {
    expect(styles).toContain('grid-template-rows: 44px minmax(0, 1fr) auto;');
  });
});
