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

  it('separates the 18px toggle strip from the 4px resize edge', () => {
    expect(appSource).toContain('class="ai-dock-resize-edge"');
    expect(appSource).toContain('class="ai-dock-toggle"');
    expect(styles).toContain('grid-template-rows: 4px 18px minmax(0, 1fr);');
    expect(styles).toContain('.ai-dock-resize-edge { height: 4px;');
    expect(styles).toContain('.ai-dock-toggle { display: grid; width: 100%; height: 18px;');
  });

  it('uses a compact 44px topbar', () => {
    expect(styles).toContain('grid-template-rows: 44px 44px minmax(0, 1fr) auto;');
  });
});
