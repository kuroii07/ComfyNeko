export type Locale = "zh-CN" | "en-US";

type MessageKey =
  | "app.title"
  | "common.back"
  | "common.next"
  | "environment.apiHelp"
  | "environment.apiPort"
  | "environment.comfyRoot"
  | "environment.diagnostics.clear"
  | "environment.diagnostics.pending"
  | "environment.diagnostics.title"
  | "environment.name"
  | "environment.probe"
  | "environment.probeFirst"
  | "environment.probing"
  | "environment.python"
  | "environment.requestFailed"
  | "environment.root.custom_nodes"
  | "environment.root.input"
  | "environment.root.models"
  | "environment.root.output"
  | "environment.root.workflows"
  | "environment.rootsHelp"
  | "environment.save"
  | "environment.saveBlocked"
  | "environment.saved"
  | "environment.saving"
  | "environment.step.1"
  | "environment.step.2"
  | "environment.step.3"
  | "environment.step.4"
  | "environment.steps"
  | "environment.title"
  | "environment.description"
  | "environment.pythonNotConfigured"
  | "navigation.collapse"
  | "navigation.environment"
  | "navigation.expand"
  | "navigation.home"
  | "navigation.primary"
  | "navigation.settings"
  | "shell.language"
  | "shell.language.english"
  | "shell.language.chinese"
  | "shell.theme"
  | "shell.theme.dark"
  | "shell.theme.light"
  | "shell.theme.system"
  | "settings.manualUpdate";

const messages: Record<Locale, Partial<Record<MessageKey, string>>> = {
  "zh-CN": {
    "app.title": "ComfyNeko",
    "common.back": "上一步",
    "common.next": "下一步",
    "environment.apiHelp": "API 为可选项，仅允许连接本机 127.0.0.1。",
    "environment.apiPort": "ComfyUI API 端口（可选）",
    "environment.comfyRoot": "ComfyUI 根目录",
    "environment.diagnostics.clear": "未发现阻塞问题，可以保存此环境。",
    "environment.diagnostics.pending": "尚未检查。检查过程只读取路径和运行时信息。",
    "environment.diagnostics.title": "环境诊断",
    "environment.name": "环境名称",
    "environment.probe": "检查环境",
    "environment.probeFirst": "请先检查环境",
    "environment.probing": "检查中…",
    "environment.python": "Python 解释器",
    "environment.requestFailed": "环境操作失败",
    "environment.root.custom_nodes": "自定义节点目录",
    "environment.root.input": "输入目录",
    "environment.root.models": "模型目录",
    "environment.root.output": "输出目录",
    "environment.root.workflows": "工作流目录",
    "environment.rootsHelp": "每行填写一个目录；不存在的目录只会提示，不会自动创建。",
    "environment.save": "保存环境",
    "environment.saveBlocked": "请先处理阻塞问题",
    "environment.saved": "环境已保存",
    "environment.saving": "保存中…",
    "environment.step.1": "基础信息",
    "environment.step.2": "Python 与 API",
    "environment.step.3": "目录映射",
    "environment.step.4": "检查并保存",
    "environment.steps": "环境绑定步骤",
    "environment.title": "绑定 ComfyUI 环境",
    "environment.description": "确认路径诊断后保存；此操作不会修改 ComfyUI 文件。",
    "environment.pythonNotConfigured": "尚未选择 Python 解释器",
    "navigation.collapse": "收起侧栏",
    "navigation.environment": "环境",
    "navigation.expand": "展开侧栏",
    "navigation.home": "首页",
    "navigation.primary": "主导航",
    "navigation.settings": "设置",
    "shell.language": "语言",
    "shell.language.english": "English",
    "shell.language.chinese": "中文",
    "shell.theme": "外观主题",
    "shell.theme.dark": "深色",
    "shell.theme.light": "浅色",
    "shell.theme.system": "跟随系统"
  },
  "en-US": {
    "app.title": "ComfyNeko",
    "common.back": "Back",
    "common.next": "Next",
    "environment.apiHelp": "The API is optional and limited to local host 127.0.0.1.",
    "environment.apiPort": "ComfyUI API port (optional)",
    "environment.comfyRoot": "ComfyUI root",
    "environment.diagnostics.clear": "No blocking issues found. This profile can be saved.",
    "environment.diagnostics.pending": "Not checked yet. Validation only reads paths and runtime details.",
    "environment.diagnostics.title": "Environment diagnostics",
    "environment.name": "Environment name",
    "environment.probe": "Check environment",
    "environment.probeFirst": "Check the environment first",
    "environment.probing": "Checking…",
    "environment.python": "Python interpreter",
    "environment.requestFailed": "Environment operation failed",
    "environment.root.custom_nodes": "Custom nodes folders",
    "environment.root.input": "Input folders",
    "environment.root.models": "Model folders",
    "environment.root.output": "Output folders",
    "environment.root.workflows": "Workflow folders",
    "environment.rootsHelp": "Enter one folder per line. Missing folders are reported and never created.",
    "environment.save": "Save environment",
    "environment.saveBlocked": "Resolve blocking issues first",
    "environment.saved": "Environment saved",
    "environment.saving": "Saving…",
    "environment.step.1": "Basics",
    "environment.step.2": "Python and API",
    "environment.step.3": "Folder mapping",
    "environment.step.4": "Review and save",
    "environment.steps": "Environment setup steps",
    "environment.title": "Bind a ComfyUI environment",
    "environment.description": "Review path diagnostics before saving. This never changes ComfyUI files.",
    "environment.pythonNotConfigured": "No Python interpreter is selected.",
    "navigation.collapse": "Collapse sidebar",
    "navigation.environment": "Environments",
    "navigation.expand": "Expand sidebar",
    "navigation.home": "Home",
    "navigation.primary": "Primary navigation",
    "navigation.settings": "Settings",
    "shell.language": "Language",
    "shell.language.english": "English",
    "shell.language.chinese": "Chinese",
    "shell.theme": "Appearance theme",
    "shell.theme.dark": "Dark",
    "shell.theme.light": "Light",
    "shell.theme.system": "Follow system",
    "settings.manualUpdate": "Manual update instructions"
  }
};

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages["en-US"][key] ?? key;
}
