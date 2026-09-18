import { describe, expect, it } from 'vitest';
import { operationErrorReason } from './operationMessage';

describe('operationErrorReason', () => {
  it('translates file errors according to the attempted operation', () => {
    expect(operationErrorReason('create-file', 'project item already exists')).toBe('同名文件或文件夹已存在');
    expect(operationErrorReason('create-folder', 'project item already exists')).toBe('同名文件或文件夹已存在');
    expect(operationErrorReason('rename', 'project item already exists')).toBe('目标名称已被占用');
    expect(operationErrorReason('upload', 'project item already exists')).toBe('目标目录中存在同名文件');
    expect(operationErrorReason('delete', 'project item does not exist')).toBe('文件或文件夹已不存在');
    expect(operationErrorReason('save', 'source file changed externally')).toBe('文件内容已变化，请确认最新内容后重试保存');
    expect(operationErrorReason('create-file', 'project item name is invalid')).toBe('文件名为空、属于系统保留名或包含非法字符');
    expect(operationErrorReason('rename', 'project item name is invalid')).toBe('目标名称为空、属于系统保留名或包含非法字符');
  });

  it('keeps an unknown backend reason visible', () => {
    expect(operationErrorReason('rename', 'unexpected failure')).toBe('unexpected failure');
  });
});
