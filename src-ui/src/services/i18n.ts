/**
 * i18n — Lightweight internationalization for CKAN-M.
 * Supports English (en) and Chinese (zh).
 * Uses React context for reactive language switching.
 */

export type Language = 'en' | 'zh';

// ---------------------------------------------------------------------------
// Translation map
// ---------------------------------------------------------------------------

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Settings
    'settings.title': 'Settings',
    'settings.account': 'Account',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.darkMode': 'Dark mode active',
    'settings.lightMode': 'Light mode active',
    'settings.dark': 'Dark Mode',
    'settings.light': 'Light Mode',
    'settings.aiAssistant': 'AI Assistant',
    'settings.model': 'Model',
    'settings.usageLimits': 'Usage Limits',
    'settings.usageDesc': 'Free: 20 requests/day | Paid: Unlimited (1 point/request)',
    'settings.paidTier': 'Paid Tier',
    'settings.comingSoon': 'Coming soon — credits system in development',
    'settings.apiKeys': 'AI API Keys',
    'settings.apiKeysDesc': 'Connect your own API keys to use custom AI providers. Keys are stored locally in your browser.',
    'settings.runsLocally': 'Runs locally — no API key needed',
    'settings.keySaved': 'Key saved',
    'settings.missionChatter': 'Mission Control Chatter',
    'settings.missionChatterOn': 'Kerbals chat with each other when you\'re idle',
    'settings.missionChatterOff': 'Kerbals only respond when you message them',
    'settings.chatterDisclaimer': 'Kerbals will autonomously chat with each other when you\'re idle. This consumes AI API calls. Disable anytime if you prefer kerbals only respond when spoken to.',
    'settings.kerbalModel': 'Kerbal Chat Model',
    'settings.kerbalModelDesc': 'Specific AI model for kerbals. Leave empty for system default.',
    'settings.registry': 'CKAN Registry',
    'settings.language': 'Language',
    'settings.languageDesc': 'Interface display language',

    // Mission Control
    'mc.loading': 'Loading Kerbal souls...',
    'mc.dayShift': 'Day shift arriving (06:00). Kerbals taking their stations.',
    'mc.nightShift': 'Night shift arriving (18:00). Night crew on duty.',
    'mc.noKerbals': 'No Kerbals are currently on shift. Wait for a shift change or check the roster.',
    'mc.signalLost': 'Signal lost -- the Kerbals could not respond. Check the comms link.',
    'mc.emptyChat': 'Mission Control Communications',
    'mc.emptyChatDesc': 'The crew is standing by. Send a message to get started -- the right Kerbal will pick it up.',
    'mc.inputPlaceholder': 'Send a message to Mission Control...',
    'mc.waitingPlaceholder': 'Waiting for the crew to respond...',
    'mc.pressEnter': 'Press Enter to send',
    'mc.kerbalsOnShift': 'Kerbal(s) on shift',
    'mc.contacts': 'Contacts',
    'mc.startConversation': 'Start a conversation with',
    'mc.messageThem': 'Message',
    'mc.typing': 'is typing...',
    'mc.thinking': 'is thinking...',
    'mc.waking': 'Waking',
    'mc.noResponse': 'No response. They must be deep asleep.',
    'mc.mumbles': 'mumbles sleepily',
    'mc.stares': 'stares at the screen blankly',
    'mc.awayBathroom': 'is away from their desk (bathroom break). They\'ll respond when they return.',
    'mc.awayLunch': 'is away from their desk (lunch break). They\'ll respond when they return.',
    'mc.openPhone': 'Open Smartphone',
    'mc.offShiftPhone': '{name} is off-shift right now.',
    'mc.offShiftPhoneHint': 'Use the phone to call off-shift Kerbals.',
    'mc.usePhone': 'Use Phone',
    'mc.phoneHint': 'Open phone',
    'mc.clearChat': 'Clear',
    'mc.clearHistory': 'Clear chat history',

    // Kerbal positions
    'status.onShift': 'On shift',
    'status.onBreak': 'On break',
    'status.offShift': 'Off shift',

    // Banter tags
    'banter.tag': 'banter',
    'route.broadcast': 'to crew',
    'route.chimed': 'chimed in',
    'route.mentioned': 'mentioned',
    'route.checkin': 'check-in',

    // Common
    'common.on': 'ON',
    'common.off': 'OFF',
    'common.save': 'Save',
    'common.clear': 'Clear',
    'common.cancel': 'Cancel',
    'common.signIn': 'Sign In',
    'common.signOut': 'Sign Out',
    'common.soon': 'SOON',
    'common.free': 'FREE',
    'common.auto': 'Auto',
    'common.placeholder': 'Paste API key...',
    'common.search': 'Search',
  },
  zh: {
    // Settings
    'settings.title': '设置',
    'settings.account': '账户',
    'settings.appearance': '外观',
    'settings.theme': '主题',
    'settings.darkMode': '深色模式已开启',
    'settings.lightMode': '浅色模式已开启',
    'settings.dark': '深色模式',
    'settings.light': '浅色模式',
    'settings.aiAssistant': 'AI 助手',
    'settings.model': '模型',
    'settings.usageLimits': '使用限制',
    'settings.usageDesc': '免费：20次/天 | 付费：无限（1积分/次）',
    'settings.paidTier': '付费套餐',
    'settings.comingSoon': '即将推出 — 积分系统开发中',
    'settings.apiKeys': 'AI API 密钥',
    'settings.apiKeysDesc': '连接你自己的 API 密钥以使用自定义 AI 提供商。密钥仅存储在本地浏览器中。',
    'settings.runsLocally': '本地运行 — 无需 API 密钥',
    'settings.keySaved': '密钥已保存',
    'settings.missionChatter': '任务控制中心闲聊',
    'settings.missionChatterOn': '空闲时 Kerbal 会自动聊天',
    'settings.missionChatterOff': 'Kerbal 仅在您发送消息时回复',
    'settings.chatterDisclaimer': 'Kerbal 会在您空闲时自主聊天。这会消耗 AI API 调用次数。如果不希望 Kerbal 主动聊天，可随时禁用。',
    'settings.kerbalModel': 'Kerbal 聊天模型',
    'settings.kerbalModelDesc': '为 Kerbal 指定的 AI 模型。留空则使用系统默认。',
    'settings.registry': 'CKAN 注册表',
    'settings.language': '语言',
    'settings.languageDesc': '界面显示语言',

    // Mission Control
    'mc.loading': '正在加载 Kerbal 灵魂...',
    'mc.dayShift': '白班到岗 (06:00)。Kerbal 正在就位。',
    'mc.nightShift': '夜班到岗 (18:00)。夜班人员已就位。',
    'mc.noKerbals': '当前没有 Kerbal 值班。等待换班或查看排班表。',
    'mc.signalLost': '信号丢失 -- Kerbal 无法回应。请检查通讯链路。',
    'mc.emptyChat': '任务控制中心通讯',
    'mc.emptyChatDesc': '全体人员待命中。发送消息开始 — 合适的 Kerbal 会自动接听。',
    'mc.inputPlaceholder': '向任务控制中心发送消息...',
    'mc.waitingPlaceholder': '等待人员回复...',
    'mc.pressEnter': '按 Enter 发送',
    'mc.kerbalsOnShift': '人在值班',
    'mc.contacts': '联系人',
    'mc.startConversation': '开始对话',
    'mc.messageThem': '发送消息',
    'mc.typing': '正在输入...',
    'mc.thinking': '正在思考...',
    'mc.waking': '正在唤醒',
    'mc.noResponse': '无响应。他们可能睡得很沉。',
    'mc.mumbles': '迷迷糊糊地咕哝着',
    'mc.stares': '茫然地盯着屏幕',
    'mc.awayBathroom': '不在工位（上厕所去了）。回来后会回复。',
    'mc.awayLunch': '不在工位（吃午饭去了）。回来后会回复。',
    'mc.openPhone': '打开对讲机',
    'mc.offShiftPhone': '{name} 现在不在值班。',
    'mc.offShiftPhoneHint': '使用对讲机联系不在值班的 Kerbal。',
    'mc.usePhone': '使用对讲机',
    'mc.phoneHint': '打开对讲机',
    'mc.clearChat': '清除',
    'mc.clearHistory': '清除聊天记录',

    // Kerbal positions
    'status.onShift': '值班中',
    'status.onBreak': '休息中',
    'status.offShift': '未值班',

    // Banter tags
    'banter.tag': '闲聊',
    'route.broadcast': '全员',
    'route.chimed': '插话',
    'route.mentioned': '被提及',
    'route.checkin': '主动问候',

    // Common
    'common.on': '开',
    'common.off': '关',
    'common.save': '保存',
    'common.clear': '清除',
    'common.cancel': '取消',
    'common.signIn': '登录',
    'common.signOut': '退出',
    'common.soon': '即将',
    'common.free': '免费',
    'common.auto': '自动',
    'common.placeholder': '粘贴 API 密钥...',
    'common.search': '搜索',
  },
};

// ---------------------------------------------------------------------------
// i18n Service
// ---------------------------------------------------------------------------

type Listener = () => void;

class I18nService {
  private lang: Language;
  private listeners: Set<Listener> = new Set();

  constructor() {
    const saved = localStorage.getItem('ckan_language') as Language | null;
    this.lang = saved === 'zh' ? 'zh' : 'en';
  }

  get language(): Language {
    return this.lang;
  }

  /** Translate a key to the current language. Falls back to English. */
  t(key: string): string {
    return translations[this.lang]?.[key] ?? translations.en[key] ?? key;
  }

  /** Switch language and persist. */
  setLanguage(lang: Language): void {
    this.lang = lang;
    try {
      localStorage.setItem('ckan_language', lang);
    } catch {}
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const i18n = new I18nService();

/** Shorthand for i18n.t() */
export function t(key: string): string {
  return i18n.t(key);
}
