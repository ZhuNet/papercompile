import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';

describe('toolbar messages', () => {
  it('renders transient operation feedback as a floating notice instead of the AI dock', () => {
    expect(appSource).toContain('class={`toolbar-message ${current().tone}`}');
    expect(appSource).not.toContain('class="ai-toast"');
    expect(appSource).not.toContain('project-notice');
    expect(styles).toContain('.toolbar-message');
    expect(styles).not.toContain('.ai-toast');
    expect(styles).not.toContain('.project-notice');
    expect(styles).toContain('position: fixed; top: 54px; right: 16px;');
    expect(styles).toContain('pointer-events: none;');
  });

  it('uses separate success and error lifetimes and operation-specific failures', () => {
    expect(appSource).toContain('tone === "success" ? 3000 : 6000');
    expect(appSource).toContain('无法新建文件');
    expect(appSource).toContain('无法新建文件夹');
    expect(appSource).toContain('名称为空、属于系统保留名或包含非法字符');
    expect(appSource).toContain('无法重命名');
    expect(appSource).toContain('无法删除');
    expect(appSource).toContain('无法上传文件');
    expect(appSource).not.toContain('文件操作失败');
  });
});
