import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';
import capability from '../../src-tauri/capabilities/default.json';

describe('window controls', () => {
  it('places minimize, maximize, and close controls at the right of the topbar', () => {
    expect(appSource).toContain('class="app-identity"');
    expect(appSource).toContain('class="business-actions"');
    expect(appSource).toContain('class="topbar-spacer"');
    expect(appSource).toContain('<img src="/app-icon.svg" alt="" />');
    expect(appSource).not.toContain('<span>PaperCompile</span>');
    expect(appSource).toContain('class="window-actions"');
    expect(appSource).toContain('aria-label="最小化"');
    expect(appSource).toContain('aria-label={windowMaximized() ? "还原" : "最大化"}');
    expect(appSource).toContain('aria-label="关闭"');
    expect(appSource.indexOf('class="window-actions"')).toBeGreaterThan(appSource.indexOf('class="business-actions"'));
    expect(appSource.indexOf('class="app-identity"')).toBeLessThan(appSource.indexOf('class="topbar-view-toggle"'));
    expect(appSource.indexOf('class="topbar-view-toggle"')).toBeLessThan(appSource.indexOf('class="topbar-spacer"'));
    expect(appSource.indexOf('class="topbar-spacer"')).toBeLessThan(appSource.indexOf('class="window-actions"'));
    expect(appSource.indexOf('class="topbar-spacer"')).toBeLessThan(appSource.indexOf('class="business-actions"'));
    expect(appSource.indexOf('class="business-actions"')).toBeLessThan(appSource.indexOf('class="window-actions"'));
    expect(appSource.match(/class="window-control/g)).toHaveLength(3);
    expect(styles).toContain('.window-control');
    expect(styles).toContain('place-items: center');
    expect(styles).toContain('width: 30px');
    expect(styles).toContain('height: 30px');
  });

  it('does not invoke native dragging from topbar clicks', () => {
    expect(appSource).toContain('onMouseDown={startWindowDrag}');
    expect(appSource).toContain('onDblClick={toggleWindowMaximize}');
    expect(appSource).toContain('setPosition');
    expect(appSource).toContain('pointermove');
    expect(appSource).toContain('pointerup');
    expect(capability.permissions).toContain('core:window:allow-set-position');
    expect(capability.permissions).not.toContain('core:window:allow-start-dragging');
    expect(appSource).not.toContain('startDragging()');
    expect(appSource).not.toContain('data-tauri-drag-region');
  });
});
