export type Locale = "zh-CN" | "en-US";

type MessageKey =
  | "app.title"
  | "environment.save"
  | "environment.saveBlocked"
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
    "environment.save": "保存环境",
    "environment.saveBlocked": "请先处理阻塞问题",
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
    "environment.save": "Save environment",
    "environment.saveBlocked": "Resolve blocking issues first",
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
