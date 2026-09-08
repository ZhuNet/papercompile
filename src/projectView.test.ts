import { describe, expect, it } from 'vitest';
import { projectViewFromResponse, contentForPath, projectLocation, projectNotice } from './projectView';

describe('projectViewFromResponse', () => {
  it('uses the entry file content and lists discovered project files', () => {
    const view = projectViewFromResponse({
      root: 'C:/papers/demo',
      entry: 'main.tex',
      files: [
        { path: 'main.tex', content: '\\section{真实标题}\n真实正文。', content_hash: 'hash' },
        { path: 'references.bib', content: '@article{x}', content_hash: 'bib-hash' },
      ],
    });

    expect(view.entryPath).toBe('main.tex');
    expect(view.entryContent).toContain('真实正文');
    expect(view.files).toEqual(['main.tex', 'references.bib']);
  });

  it('returns source content for a selected project file', () => {
    const project = { root: 'demo', entry: 'main.tex', files: [{ path: 'main.tex', content: 'main', content_hash: 'a' }, { path: 'refs.bib', content: 'refs', content_hash: 'b' }] };
    expect(contentForPath(project.files, 'refs.bib')).toBe('refs');
  });

  it('keeps the full folder path while deriving a short project name', () => {
    expect(projectLocation('F:/Research/My Paper')).toEqual({ name: 'My Paper', path: 'F:/Research/My Paper' });
  });

  it('formats a project notice without embedding an unbounded path in the message', () => {
    expect(projectNotice('F:/Research/My Paper', true)).toEqual({
      title: '项目已打开',
      detail: 'My Paper',
      path: 'F:/Research/My Paper',
      tone: 'success',
    });
  });
});
