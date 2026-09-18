export type OperationKind =
  | 'open-project'
  | 'save'
  | 'create-file'
  | 'create-folder'
  | 'rename'
  | 'delete'
  | 'upload';

const sharedReasons: Partial<Record<string, string>> = {
  'project item does not exist': '文件或文件夹已不存在',
};

const reasonsByOperation: Record<OperationKind, Partial<Record<string, string>>> = {
  'open-project': {
    'project directory does not exist': '所选项目文件夹不存在',
    'could not identify a unique LaTeX entry file': '无法确定唯一的 LaTeX 入口文件',
    'dependency escapes project directory': '项目依赖指向了项目目录外部',
    'project file could not be read': '项目文件无法读取，请检查文件权限或编码',
  },
  save: {
    'source path is unsafe': '文件路径不安全',
    'source file cannot be read': '文件无法读取或写入，请检查文件权限',
    'source file changed externally': '文件内容已变化，请确认最新内容后重试保存',
  },
  'create-file': {
    'project item name is invalid': '文件名为空、属于系统保留名或包含非法字符',
    'project path is unsafe': '文件名或目标路径不安全',
    'project item already exists': '同名文件或文件夹已存在',
    'project file operation failed': '无法写入文件，请检查目录权限或磁盘状态',
  },
  'create-folder': {
    'project item name is invalid': '文件夹名称为空、属于系统保留名或包含非法字符',
    'project path is unsafe': '文件夹名称或目标路径不安全',
    'project item already exists': '同名文件或文件夹已存在',
    'project file operation failed': '无法创建文件夹，请检查目录权限',
  },
  rename: {
    'project item name is invalid': '目标名称为空、属于系统保留名或包含非法字符',
    'project path is unsafe': '原路径或目标路径不安全',
    'project item already exists': '目标名称已被占用',
    'project item does not exist': '要重命名的文件或文件夹已不存在',
    'project file operation failed': '无法重命名或移动，请检查文件是否被占用',
  },
  delete: {
    'project path is unsafe': '文件或文件夹路径不安全',
    'project item does not exist': '文件或文件夹已不存在',
    'project file operation failed': '无法移入回收站，请检查文件权限',
  },
  upload: {
    'project path is unsafe': '目标目录或源文件路径不安全',
    'project item already exists': '目标目录中存在同名文件',
    'project file operation failed': '无法复制文件，请检查目录权限或磁盘状态',
  },
};

export function operationErrorReason(operation: OperationKind, error: unknown): string {
  const reason = String(error);
  return reasonsByOperation[operation][reason] ?? sharedReasons[reason] ?? reason;
}
