import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';

describe('source search UI', () => {
  it('renders current-file search controls in the source header', () => {
    expect(appSource).toContain('class="source-search"');
    expect(appSource).toContain('placeholder="搜索当前文件"');
    expect(appSource).toContain('aria-label="上一个匹配"');
    expect(appSource).toContain('aria-label="下一个匹配"');
    expect(appSource).toContain('highlightSourceMatches(');
  });

  it('separates the 16px toggle strip from the 4px resize edge', () => {
    expect(appSource).toContain('class="ai-dock-resize-edge"');
    expect(appSource).toContain('class="ai-dock-toggle"');
    expect(styles).toContain('grid-template-rows: 4px 16px minmax(0, 1fr);');
    expect(styles).toContain('.ai-dock-resize-edge { height: 4px;');
    expect(styles).toContain('.ai-dock-toggle { display: grid; width: 100%; height: 16px;');
  });

  it('wraps both source layers and removes horizontal scrolling', () => {
    expect(styles).toContain('white-space: pre-wrap;');
    expect(styles).toContain('overflow-wrap: anywhere;');
    expect(styles).toContain('overflow-x: hidden;');
    expect(appSource).not.toContain('editor.scrollLeft = position.left');
    expect(appSource).toContain('source-search-match.current');
    expect(appSource).toContain('matchElement.offsetTop');
    expect(appSource).toContain('let previousPath = props.path;');
    expect(appSource).toContain('let previousQuery = searchQuery();');
    expect(appSource).toContain('untrack(() => matches()[activeMatch()])');
    expect(styles).toContain('.source-code .source-editor::selection { color: #f8f8f2;');
  });

  it('uses a compact 44px topbar', () => {
    expect(styles).toContain('grid-template-rows: 44px 44px minmax(0, 1fr) auto;');
  });
});
