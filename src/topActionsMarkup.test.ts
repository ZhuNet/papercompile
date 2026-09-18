import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import styles from './styles.css?inline';

describe('top action icons', () => {
  it('uses consistent 24px outline SVGs for save, undo, and compile', () => {
    expect(appSource.match(/action-svg/g)).toHaveLength(3);
    expect(appSource.match(/viewBox="0 0 24 24"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(appSource).toContain('<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />');
    expect(appSource).toContain('<rect x="7" y="4" width="9" height="5" rx="1" />');
    expect(appSource).toContain('<rect x="7" y="13" width="10" height="7" rx="1" />');
    expect(appSource).toContain('<path d="M8 7H3v-5" />');
    expect(appSource).toContain('<path d="M3.7 7.1A9 9 0 1 1 3.4 17" />');
    expect(appSource).toContain('<path d="M5 3v18l16-9z" />');
    expect(styles).not.toContain('.save-icon::before');
    expect(styles).not.toContain('border-left: 15px solid currentColor');
  });
});
