import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('project status markup', () => {
  it('shows a colored dot for saved and unsaved source states', () => {
    expect(appSource).toContain('class={`source-status-dot ${dirty() ? "unsaved" : "saved"}`}');
    expect(styles).toContain('.source-status-dot.saved');
    expect(styles).toContain('.source-status-dot.unsaved');
  });
});
