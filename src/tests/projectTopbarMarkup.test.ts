import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';

describe('project topbar', () => {
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

  it('centres the project control and lets long paths scroll on hover', () => {
    expect(styles).toContain('.brand, .top-actions { width: 280px; }');
    expect(styles).toContain('.project-path-display:hover { overflow-x: auto; text-overflow: clip; }');
    expect(styles).toContain('direction: rtl;');
  });
});
