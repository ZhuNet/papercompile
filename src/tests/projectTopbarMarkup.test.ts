import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';

describe('project topbar', () => {
  it('merges view controls into the topbar and moves project navigation into the file pane', () => {
    expect(appSource).toContain('class="project-file-header"');
    expect(appSource).toContain('class="topbar-view-toggle"');
    expect(appSource).not.toContain('class="brand"');
    expect(appSource).not.toContain('class="toolbar-spacer"');
    expect(appSource).not.toContain('class="save-state');
    expect(appSource).not.toContain('class="compile-state"');
  });

  it('uses a folder button as the only project-opening control', () => {
    expect(appSource).toContain('class="project-folder-button"');
    expect(appSource).toContain('aria-label="打开项目文件夹"');
    expect(appSource).toContain('onClick={openProject}');
    expect(appSource).toContain('class="project-path-display"');
    expect(appSource).not.toContain('class="project-button"');
    expect(appSource).not.toContain('navigator.clipboard?.writeText(projectRoot())');
    expect(appSource).not.toContain('点击选择 LaTeX 项目文件夹');
  });

  it('shows no placeholder path before a project is opened', () => {
    expect(appSource).toContain('<Show when={projectRoot()}>');
    expect(appSource).toContain('{projectRoot()}');
  });

  it('fits the project control into the file pane and lets long paths scroll on hover', () => {
    expect(styles).toContain('.project-file-header { display: flex;');
    expect(styles).toContain('.project-path-display:hover { overflow-x: auto; text-overflow: clip; }');
    expect(styles).toContain('direction: rtl;');
  });
});
