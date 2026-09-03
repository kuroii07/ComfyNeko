export type Locale = "zh-CN" | "en-US";

type MessageKey =
  | "environment.save"
  | "environment.saveBlocked"
  | "environment.title"
  | "environment.description"
  | "settings.manualUpdate";

const messages: Record<Locale, Partial<Record<MessageKey, string>>> = {
  "zh-CN": {
    "environment.save": "保存环境",
    "environment.saveBlocked": "请先处理阻塞问题",
    "environment.title": "绑定 ComfyUI 环境",
    "environment.description": "确认路径诊断后保存；此操作不会修改 ComfyUI 文件。"
  },
  "en-US": {
    "environment.save": "Save environment",
    "environment.saveBlocked": "Resolve blocking issues first",
    "environment.title": "Bind a ComfyUI environment",
    "environment.description": "Review path diagnostics before saving. This never changes ComfyUI files.",
    "settings.manualUpdate": "Manual update instructions"
  }
};

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages["en-US"][key] ?? key;
}
