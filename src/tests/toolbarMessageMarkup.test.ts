import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import styles from '../styles.css?inline';

describe('toolbar messages', () => {
  it('renders transient operation feedback in the toolbar instead of the AI dock or corner notice', () => {
    expect(appSource).toContain('class={`toolbar-message ${current().tone}`}');
    expect(appSource).not.toContain('class="ai-toast"');
    expect(appSource).not.toContain('project-notice');
    expect(styles).toContain('.toolbar-message');
    expect(styles).not.toContain('.ai-toast');
    expect(styles).not.toContain('.project-notice');
    expect(styles).toContain('font-weight: 700');
    expect(styles).not.toContain('.toolbar-message { position: absolute; left: 50%; z-index: 2; overflow: hidden; max-width: min(48vw, 620px); padding: 4px 10px;');
    expect(styles).not.toContain('border: 1px solid #b8d0be');
    expect(styles).not.toContain('background: #edf6ef');
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
