/**
 * i18n — Lightweight internationalization for CKAN-M.
 * Supports English (en) and Chinese (zh).
 * Uses React context for reactive language switching via useSyncExternalStore.
 *
 * This is the SINGLE source of truth for all UI translations.
 * All components should import `t` or `useT` from this module.
 */

import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Language = 'en' | 'zh';

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

// ---------------------------------------------------------------------------
// Translation map
// ---------------------------------------------------------------------------

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.available': 'Available',
    'nav.installed': 'Installed',
    'nav.downloads': 'Downloads',
    'nav.instances': 'Instances',
    'nav.settings': 'Settings',
    'nav.aiAssistant': 'AI Assistant',
    'nav.collapse': 'Collapse',
    'nav.expand': 'Expand',
    'nav.modsLoaded': '{count} mods loaded',
    'nav.loadingRegistry': 'Loading registry…',
    'nav.installed.count': '{count} installed',
    'nav.missionControl': 'Mission Control',

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
    'settings.missionChatterOn': "Kerbals chat with each other when you're idle",
    'settings.missionChatterOff': 'Kerbals only respond when you message them',
    'settings.chatterDisclaimer': "Kerbals will autonomously chat with each other when you're idle. This consumes AI API calls. Disable anytime if you prefer kerbals only respond when spoken to.",
    'settings.kerbalModel': 'Kerbal Chat Model',
    'settings.kerbalModelDesc': 'Specific AI model for kerbals. Leave empty for system default.',
    'settings.kerbalModelExample': 'Example: kimi-k2.6:cloud',
    'settings.registry': 'CKAN Registry',
    'settings.language': 'Language',
    'settings.languageDesc': 'Interface display language',
    'settings.supabaseNotConfigured': 'Supabase Not Configured',
    'settings.supabaseConfigHint': 'Add your anon key in src/services/supabase.ts to enable auth',
    'settings.signInPrompt': 'Sign in to CKAN',
    'settings.signInPromptDesc': 'Sync mods and AI points across devices',
    'settings.authSuccess': 'Account created! Check your email inbox and click the verification link to activate your account.',
    'settings.repository': 'Repository',
    'settings.repositoryDesc': 'master — github.com/KSP-CKAN/CKAN-meta',
    'settings.manage': 'Manage',

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
    'mc.aiUnavailable': 'seems distracted... (AI unavailable -- check API key in Settings)',
    'mc.kerbalCantRespond': "{name} couldn't respond -- check AI settings.",
    'mc.messageInput': 'Message input',
    'mc.sendMessage': 'Send message',
    'mc.sendHint': 'Send message (Enter)',
    'mc.backToContacts': 'Back to contacts',
    'mc.close': 'Close',
    'mc.chat': 'Chat',

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

    // Time of day
    'time.earlyMorning': 'early morning',
    'time.morning': 'morning',
    'time.earlyAfternoon': 'early afternoon',
    'time.afternoon': 'afternoon',
    'time.evening': 'evening',
    'time.night': 'night',
    'time.lateNight': 'late night',
    'time.preDawn': 'pre-dawn',
    'time.middleOfNight': 'middle of the night',

    // AI Chat actions
    'ai.action.install': 'Install {modId}',
    'ai.action.uninstall': 'Uninstall {modId}',
    'ai.action.search': 'Search: {query}',
    'ai.action.refreshRepo': 'Refresh Repository',
    'ai.welcome': "Hi! I'm your CKAN AI assistant. I can help you find mods, explain dependencies, and recommend mod packs.\n\nSign in (Settings > Account) to start chatting. Free tier: 20 messages/day.",

    // Banter fallback templates
    'banter.fallback.initiator.0': 'Did you hear about "{context}"? That\'s wild.',
    'banter.fallback.initiator.1': '{context} — I have *thoughts* about this one.',
    'banter.fallback.initiator.2': '{context}? Honestly...',
    'banter.fallback.initiator.3': 'Oh, you\'re not going to believe what I heard about "{context}".',
    'banter.fallback.responder.0': 'Oh, definitely! I completely agree.',
    'banter.fallback.responder.1': 'Hmm, I see your point but I\'m not so sure...',
    'banter.fallback.responder.2': 'That\'s exactly what I was thinking.',
    'banter.fallback.responder.3': 'Wait, really? Tell me more.',
    'banter.fallback.responder.4': 'I have a story about this actually.',

    // FAQ
    'faq.q1.question': 'What is CKAN Modern?',
    'faq.q1.answer': 'A mod manager for Kerbal Space Program, rebuilt from scratch in .NET 8 WPF with a React-based UI. It uses real CKAN repository data and works alongside the original CKAN.',
    'faq.q2.question': 'Is this the official CKAN?',
    'faq.q2.answer': 'No. This is a community project, not affiliated with the original CKAN team. The original CKAN remains fully supported.',
    'faq.q3.question': 'Why does the app ask me to sign in? Is it required?',
    'faq.q3.answer': 'Sign-in is optional. The core mod manager features work without an account. Signing in uses Supabase authentication and is only needed for optional features like AI assistant access and cloud sync.',
    'faq.q4.question': 'What data do you collect about me?',
    'faq.q4.answer': 'If you choose to sign in, only your email address is stored via Supabase. We do not collect gameplay data, system information, or any other personal info. No tracking. No analytics. Your mod configs (if you opt in to cloud sync) are stored only under your account and are inaccessible to anyone else.',
    'faq.q5.question': 'What is Cloud Sync?',
    'faq.q5.answer': 'It lets you save and restore your mod lists, instance configs, and repository settings so you can move your setup between computers. You can also export everything as local backup files and store them wherever you want — Dropbox, OneDrive, Google Drive, wherever.',
    'faq.q6.question': 'What is the AI Assistant?',
    'faq.q6.answer': 'A built-in chat panel where you can ask mod-related questions in plain English. It queries the CKAN mod database combined with an LLM (via the Silicon Flow API) to give contextual answers like "what mods work well together for a station build?"',
    'faq.q7.question': 'Does the AI cost money?',
    'faq.q7.answer': 'Each AI query calls an external API that has usage costs. The free tier gives you a limited number of queries per day. If you need more, a paid tier is planned (see below). The core mod manager will always be free.',
    'faq.q8.question': 'What would paid tiers include?',
    'faq.q8.answer': 'Still in planning, but likely: higher AI query limits, and possibly priority feature requests. No core mod management features will ever be paywalled. The paid tiers only cover ongoing costs like AI API usage.',
    'faq.q9.question': 'Where does the mod data come from?',
    'faq.q9.answer': 'Directly from the official CKAN-NetKAN/meta repository (github.com/KSP-CKAN/). The same data source the original CKAN uses.',
    'faq.q10.question': 'Is the app open source?',
    'faq.q10.answer': 'Yes. Full source code at github.com/900watts/CKAN-MODERN under MIT license.',
    'faq.q11.question': 'When is the next release?',
    'faq.q11.answer': 'No fixed date. The project is still early. Follow the GitHub repo for updates and release notes.',
    'faq.issue1.title': 'Mod install/uninstall occasionally fails',
    'faq.issue1.description': 'Some users report that installing or removing mods does not always work on the first attempt. The operation may silently fail or hang.',
    'faq.issue1.workaround': 'Retry the operation. If it still fails, restart the app and try again. This is a known bug being actively investigated.',
    'faq.issue2.title': 'New instances not detected on first launch',
    'faq.issue2.description': 'After adding a KSP game instance, the app may not detect it immediately. Some users report needing to open and close the app multiple times (5–10 times) before the instance is recognized.',
    'faq.issue2.workaround': 'Close and reopen the app. Repeat if necessary until the instance appears. A fix is in progress.',

    // Common
    'common.unknownError': 'Unknown error',
    'common.on': 'ON',
    'common.off': 'OFF',
    'common.save': 'Save',
    'common.clear': 'Clear',
    'common.cancel': 'Cancel',
    'common.signIn': 'Sign In',
    'common.signOut': 'Sign Out',
    'common.signUp': 'Sign Up',
    'common.soon': 'SOON',
    'common.free': 'FREE',
    'common.auto': 'Auto',
    'common.placeholder': 'Paste API key...',
    'common.search': 'Search',
    'common.signInEmail': 'Sign In with Email',
    'common.createAccount': 'Create Account',
    'common.email': 'Email',
    'common.password': 'Password',
    'common.close': 'Close',
    'common.saved': 'Saved!',
    'common.tags': 'Tags',
    'common.links': 'Links',

    // Mod List
    'modlist.title.available': 'Available Mods',
    'modlist.title.installed': 'Installed Mods',
    'modlist.sort.popular': 'Most Popular',
    'modlist.sort.name': 'Name',
    'modlist.sort.updated': 'Recently Updated',
    'modlist.view.grid': 'Grid view',
    'modlist.view.list': 'List view',
    'modlist.search.available': 'Search available mods...',
    'modlist.search.installed': 'Search installed mods...',
    'modlist.tags': 'Tags',
    'modlist.tags.clear': 'Clear filter',
    'modlist.updates.title': 'Updates Available',
    'modlist.updates.updating': 'Updating...',
    'modlist.updates.update': 'Update',
    'modlist.updates.checking': 'Checking for updates...',
    'modlist.loading': 'Loading mods...',
    'modlist.empty.noInstalled': 'No mods installed',
    'modlist.empty.noResults': 'No mods found',
    'modlist.empty.noInstalled.hint': 'Browse the Available tab to discover mods for your game',
    'modlist.empty.noResults.hint': 'Try a different search term or check your filters',
    'modlist.installing': 'Installing...',
    'modlist.installed': 'Installed',
    'modlist.col.name': 'Name',
    'modlist.col.author': 'Author',
    'modlist.col.version': 'Version',
    'modlist.col.downloads': 'Downloads',
    'modlist.col.size': 'Size',
    'modlist.working': 'Working...',
    'modlist.remove': 'Remove',
    'modlist.install': 'Install',
    'modlist.showMore': 'Showing {shown} of {total}',
    'modlist.unmanaged.title': 'Unmanaged Mods',
    'modlist.unmanaged.hint': 'Detected in GameData but not tracked by CKAN',
    'modlist.unmanaged.badge': 'Unmanaged',
    'modlist.unmanaged.scanning': 'Scanning GameData folder...',
    'modlist.unmanaged.none': 'No unmanaged mods detected',
    'modlist.provider.title': 'Choose Provider',
    'modlist.provider.desc': '{requester} depends on {requested}. Select a provider to install:',
    'modlist.provider.cancel': 'Cancel',
    'modlist.detail.downloadPlural': 'downloads',
    'modlist.detail.download': 'download',
    'modlist.detail.installedSize': 'installed',
    'modlist.detail.compatibility': 'Compatibility',
    'modlist.detail.dependencies': 'Dependencies',
    'modlist.detail.conflicts': 'Conflicts',
    'modlist.detail.versions': 'Versions',
    'modlist.detail.homepage': 'Homepage',
    'modlist.detail.source': 'Source Code',
    'modlist.detail.spacedock': 'SpaceDock',
    'modlist.detail.bugtracker': 'Bug Tracker',
    'modlist.uninstall': 'Uninstall',
    'modlist.installMod': 'Install Mod',
    'modlist.detail.more': '+{count} more',

    // ModList status toasts
    'modlist.status.installed': '{name} installed',
    'modlist.status.removed': '{name} removed',
    'modlist.status.updated': '{name} updated',
    'modlist.status.installFailed': 'Install failed: {error}',
    'modlist.status.uninstallFailed': 'Uninstall failed: {error}',
    'modlist.status.updateFailed': 'Update failed: {error}',
    'modlist.status.genericError': 'Error: {error}',
    'modlist.status.success': 'Installed successfully',
    'modlist.status.devMode': '(dev mode)',

    // Downloads
    'downloads.title': 'Downloads',
    'downloads.empty': 'No active downloads',
    'downloads.emptyHint': 'Start installing mods to see them here',
    'downloads.clearHistory': 'Clear History',
    'downloads.active': 'Active',
    'downloads.failed': 'Failed',
    'downloads.completed': 'Completed',
    'downloads.installing': 'Installing',
    'downloads.uninstalling': 'Uninstalling',
    'downloads.started': 'Started',
    'downloads.installFailed': 'Install failed',
    'downloads.uninstallFailed': 'Uninstall failed',
    'downloads.installed': 'Installed',
    'downloads.uninstalled': 'Uninstalled',
    'downloads.retry': 'Retry',

    // Instances
    'instances.title': 'Game Instances',
    'instances.refreshing': 'Refreshing...',
    'instances.refreshRepo': 'Refresh Repository',
    'instances.addInstance': 'Add Instance',
    'instances.addGameInstance': 'Add Game Instance',
    'instances.instanceName': 'Instance Name',
    'instances.instanceNamePlaceholder': 'e.g. KSP 1.12 Modded',
    'instances.gamePath': 'Game Path',
    'instances.browse': 'Browse',
    'instances.pathHint': 'Paste the full path to your KSP installation folder',
    'instances.kspVersion': 'KSP Version',
    'instances.empty': 'No game instances found',
    'instances.emptyHint': 'Add a Kerbal Space Program installation to get started',
    'instances.addFirstGame': 'Add Your First Game',
    'instances.added': 'Added',
    'instances.downloadingRepo': 'Downloading mod repository...',
    'instances.repoUpdated': 'Repository updated — {modCount} compatible mods found',
    'instances.repoRefreshFailed': 'Refresh failed',
    'instances.syncing': 'Syncing mod repository for new instance...',
    'instances.selectKspFolder': 'Select KSP Installation Folder',
    'instances.nameRequired': 'Name is required',
    'instances.pathRequired': 'Game path is required',
    'instances.failedToAdd': 'Failed to add instance',
    'instances.removeInstance': 'Remove instance',
    'instances.refreshRepoTooltip': 'Download latest mod data from CKAN repository',
    'instances.scanning': 'Scanning for KSP installations...',
    'instances.scanComplete': 'Scan complete — {count} instance(s) found',
    'instances.scanCompleteNone': 'Scan complete — no KSP installations found',
    'instances.scanFailed': 'Scan failed: {error}',
    'instances.scanBtnTooltip': 'Scan for existing KSP installations on your system',
    'instances.scanningBtn': 'Scanning...',
    'instances.scanForGames': 'Scan for Games',
    'instances.appLoading': 'App is still loading. Please wait a moment and try again.',
    'instances.failedToBrowse': 'Failed to open folder browser',
    'instances.noResults': 'No results',
    'instances.active': 'Active',
    'instances.invalid': 'Invalid',
    'instances.setActive': 'Set as active instance',
    'instances.select': 'Select',
    'instances.failedToRemove': 'Failed to remove instance',
    'instances.failedToSwitch': 'Failed to switch active instance',

    // FAQ
    'faq.title': 'FAQ & Help',
    'faq.subtitle': 'Frequently asked questions and known issues',
    'faq.sectionTitle': 'Frequently Asked Questions',
    'faq.knownIssues': 'Known Issues',
    'faq.knownBadge': 'Known',
    'faq.workaround': 'Workaround:',
    'faq.resources': 'Resources',
    'faq.githubRepo': 'GitHub Repository',
    'faq.kspForums': 'KSP Forums',
    'faq.officialCKAN': 'Official CKAN Project',

    // Repos
    'repos.title': 'Repositories',
    'repos.defaultConfigured': 'Default repository configured',
    'repos.defaultDesc': 'CKAN-meta at github.com/KSP-CKAN/CKAN-meta',

    // AI Chat Panel
    'ai.title': 'CKAN AI',
    'ai.close': 'Close',
    'ai.provider': 'Provider',
    'ai.model': 'Model',
    'ai.customModel': 'Or type model ID',
    'ai.customModelPlaceholder': 'e.g. anthropic/claude-3.5-sonnet',
    'ai.noApiKey': 'No API key set. Add one in Settings.',
    'ai.askAnything': 'Ask me anything...',
    'ai.poweredBy': 'Powered by CKAN Cloud',
    'ai.using': 'Using {provider}',
    'ai.ckanCloud': 'CKAN Cloud',
    'ai.noKey': '(no key)',
    'ai.errorOccurred': 'Sorry, I ran into an issue: {error}. Please try again.',
    'ai.signInRequired': 'Sign in to use CKAN AI. Go to Settings > Account to create a free account.',

    // Update Banner
    'update.available': 'A new version is available',
    'update.install': 'Update Now',
    'update.updating': 'Updating...',
    'update.viewNotes': 'View release notes',
    'update.noDownloadUrl': 'Update available but download URL not found. Please download manually.',
    'update.applyFailed': 'Update failed. Please download manually from the release page.',

    // Shift Config (Kerbal)
    'shift.assignments': 'Shift Assignments',
    'shift.assignDesc': 'Assign Kerbals to day or night shifts. Click a Kerbal to move them between shifts.',
    'shift.dayShift': 'Day Shift (06:00 – 18:00)',
    'shift.nightShift': 'Night Shift (18:00 – 06:00)',
    'shift.noAssigned': 'No Kerbals assigned',
    'shift.kerbonaut': 'Kerbonaut',
    'shift.saveChanges': 'Save Changes',
    'shift.saved': 'Saved!',
    'shift.resetDefaults': 'Reset to Defaults',
    'shift.idleBanter': 'Idle Banter',
    'shift.enableIdle': 'Enable idle Kerbal conversations',
    'shift.enableIdleDesc': 'Kerbals will chat among themselves when the player is inactive.',
    'shift.idleDelay': 'Idle delay',
    'shift.minutes': '{n} minutes',
    'shift.frequency': 'Conversation frequency',
    'shift.occasional': 'Occasional',
    'shift.chatty': 'Chatty',
    'shift.tokenWarning': 'Idle conversations consume API tokens. Disable to save.',
    'shift.noResponse': 'No response.',

    // Room Canvas
    'room.title': 'CKAN  MISSION  CONTROL',
    'room.statusOk': 'ALL SYSTEMS NOMINAL',
    'room.dayShift': 'DAY SHIFT',
    'room.nightShift': 'NIGHT SHIFT',
    'room.crew': '{count} crew',
    'room.coffee': 'COFFEE',
  },

  zh: {
    // Navigation
    'nav.available': '可用模组',
    'nav.installed': '已安装',
    'nav.downloads': '下载',
    'nav.instances': '游戏实例',
    'nav.settings': '设置',
    'nav.aiAssistant': 'AI 助手',
    'nav.collapse': '收起',
    'nav.expand': '展开',
    'nav.modsLoaded': '已加载 {count} 个模组',
    'nav.loadingRegistry': '正在加载注册表…',
    'nav.installed.count': '已安装 {count} 个',
    'nav.missionControl': '任务控制中心',

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
    'settings.kerbalModelExample': '示例：kimi-k2.6:cloud',
    'settings.registry': 'CKAN 注册表',
    'settings.language': '语言',
    'settings.languageDesc': '界面显示语言',
    'settings.supabaseNotConfigured': 'Supabase 未配置',
    'settings.supabaseConfigHint': '在 src/services/supabase.ts 中添加 anon key 以启用登录功能',
    'settings.signInPrompt': '登录 CKAN',
    'settings.signInPromptDesc': '跨设备同步模组和 AI 积分',
    'settings.authSuccess': '账户已创建！请检查邮箱收件箱，点击验证链接激活账户。',
    'settings.repository': '仓库',
    'settings.repositoryDesc': 'master — github.com/KSP-CKAN/CKAN-meta',
    'settings.manage': '管理',

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
    'mc.aiUnavailable': '似乎走神了...（AI 不可用 -- 请在设置中检查 API 密钥）',
    'mc.kerbalCantRespond': '{name} 无法回复 -- 请检查 AI 设置。',
    'mc.messageInput': '消息输入',
    'mc.sendMessage': '发送消息',
    'mc.sendHint': '发送消息 (Enter)',
    'mc.backToContacts': '返回联系人',
    'mc.close': '关闭',
    'mc.chat': '聊天',

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

    // Time of day
    'time.earlyMorning': '清晨',
    'time.morning': '上午',
    'time.earlyAfternoon': '午后',
    'time.afternoon': '下午',
    'time.evening': '傍晚',
    'time.night': '晚上',
    'time.lateNight': '深夜',
    'time.preDawn': '黎明前',
    'time.middleOfNight': '午夜',

    // AI Chat actions
    'ai.action.install': '安装 {modId}',
    'ai.action.uninstall': '卸载 {modId}',
    'ai.action.search': '搜索：{query}',
    'ai.action.refreshRepo': '刷新仓库',
    'ai.welcome': "你好！我是你的 CKAN AI 助手。我可以帮你寻找模组、解释依赖关系，并推荐模组组合。\n\n登录后即可开始聊天（设置 > 账户）。免费版：每天 20 条消息。",

    // Banter fallback templates
    'banter.fallback.initiator.0': '你听说"{context}"了吗？太疯狂了。',
    'banter.fallback.initiator.1': '{context} — 我对此*有想法*。',
    'banter.fallback.initiator.2': '{context}？说实话……',
    'banter.fallback.initiator.3': '哦，你不会相信我听到的关于"{context}"的事。',
    'banter.fallback.responder.0': '哦，当然！我完全同意。',
    'banter.fallback.responder.1': '嗯，我理解你的观点，但我不太确定……',
    'banter.fallback.responder.2': '这正是我的想法。',
    'banter.fallback.responder.3': '等等，真的吗？快告诉我更多。',
    'banter.fallback.responder.4': '其实我这方面有个故事。',

    // FAQ
    'faq.q1.question': 'CKAN Modern 是什么？',
    'faq.q1.answer': 'Kerbal Space Program 的模组管理器，使用 .NET 8 WPF 和 React UI 从零重建。它使用真实的 CKAN 仓库数据，可与原版 CKAN 并存。',
    'faq.q2.question': '这是官方 CKAN 吗？',
    'faq.q2.answer': '不是。这是一个社区项目，与原始 CKAN 团队无关。原始 CKAN 仍然得到完全支持。',
    'faq.q3.question': '为什么应用要求我登录？必须登录吗？',
    'faq.q3.answer': '登录是可选的。核心模组管理功能无需账户即可使用。登录使用 Supabase 认证，仅用于 AI 助手和云同步等可选功能。',
    'faq.q4.question': '你们收集我的什么数据？',
    'faq.q4.answer': '如果你选择登录，仅通过 Supabase 存储你的邮箱地址。我们不收集游戏数据、系统信息或任何其他个人信息。无追踪。无分析。你的模组配置（如果你选择启用云同步）仅存储在你的账户下，其他人无法访问。',
    'faq.q5.question': '什么是云同步？',
    'faq.q5.answer': '它可以保存和恢复你的模组列表、实例配置和仓库设置，方便你在不同电脑之间迁移。你也可以将所有内容导出为本地备份文件，存储在你想用的任何地方 — Dropbox、OneDrive、Google Drive 都可以。',
    'faq.q6.question': 'AI 助手是什么？',
    'faq.q6.answer': '一个内置聊天面板，你可以用自然语言询问与模组相关的问题。它结合 CKAN 模组数据库和 LLM（通过 Silicon Flow API）给出上下文化的答案，例如"哪些模组组合适合建造空间站？"',
    'faq.q7.question': 'AI 功能收费吗？',
    'faq.q7.answer': '每次 AI 查询都会调用外部 API，产生使用成本。免费版每天提供有限查询次数。如果需要更多，计划推出付费版（见下文）。核心的模组管理功能将永远免费。',
    'faq.q8.question': '付费版会包含什么？',
    'faq.q8.answer': '仍在规划中，但可能包括：更高的 AI 查询限额，以及可能的优先功能请求。核心的模组管理功能永远不会设为付费墙。付费版仅用于覆盖 AI API 使用等持续成本。',
    'faq.q9.question': '模组数据来自哪里？',
    'faq.q9.answer': '直接来自官方 CKAN-NetKAN/meta 仓库（github.com/KSP-CKAN/）。原始 CKAN 使用的也是同一数据源。',
    'faq.q10.question': '这个应用是开源的吗？',
    'faq.q10.answer': '是的。完整源代码位于 github.com/900watts/CKAN-MODERN，采用 MIT 许可证。',
    'faq.q11.question': '下一个版本什么时候发布？',
    'faq.q11.answer': '没有固定日期。项目仍处于早期阶段。关注 GitHub 仓库获取更新和发布说明。',
    'faq.issue1.title': '模组安装/卸载偶尔失败',
    'faq.issue1.description': '部分用户反馈安装或移除模组时并非总能一次成功。操作可能会静默失败或卡住。',
    'faq.issue1.workaround': '重试该操作。如果仍然失败，重启应用后再试。这是一个已知错误，正在积极调查中。',
    'faq.issue2.title': '新实例在首次启动时未被检测到',
    'faq.issue2.description': '添加 KSP 游戏实例后，应用可能不会立即检测到它。部分用户反馈需要反复打开和关闭应用 5–10 次后实例才会被识别。',
    'faq.issue2.workaround': '关闭并重新打开应用。如有必要请重复此操作，直到实例出现。修复正在进行中。',

    // Common
    'common.unknownError': '未知错误',
    'common.on': '开',
    'common.off': '关',
    'common.save': '保存',
    'common.clear': '清除',
    'common.cancel': '取消',
    'common.signIn': '登录',
    'common.signOut': '退出',
    'common.signUp': '注册',
    'common.soon': '即将',
    'common.free': '免费',
    'common.auto': '自动',
    'common.placeholder': '粘贴 API 密钥...',
    'common.search': '搜索',
    'common.signInEmail': '使用邮箱登录',
    'common.createAccount': '创建账户',
    'common.email': '邮箱',
    'common.password': '密码',
    'common.close': '关闭',
    'common.saved': '已保存！',
    'common.tags': '标签',
    'common.links': '链接',

    // Mod List
    'modlist.title.available': '可用模组',
    'modlist.title.installed': '已安装模组',
    'modlist.sort.popular': '最受欢迎',
    'modlist.sort.name': '名称',
    'modlist.sort.updated': '最近更新',
    'modlist.view.grid': '网格视图',
    'modlist.view.list': '列表视图',
    'modlist.search.available': '搜索可用模组...',
    'modlist.search.installed': '搜索已安装模组...',
    'modlist.tags': '标签',
    'modlist.tags.clear': '清除筛选',
    'modlist.updates.title': '可用更新',
    'modlist.updates.updating': '更新中...',
    'modlist.updates.update': '更新',
    'modlist.updates.checking': '正在检查更新...',
    'modlist.loading': '正在加载模组...',
    'modlist.empty.noInstalled': '未安装任何模组',
    'modlist.empty.noResults': '未找到模组',
    'modlist.empty.noInstalled.hint': '浏览"可用模组"标签页来发现适合你游戏的模组',
    'modlist.empty.noResults.hint': '尝试不同的搜索词或更改筛选条件',
    'modlist.installing': '安装中...',
    'modlist.installed': '已安装',
    'modlist.col.name': '名称',
    'modlist.col.author': '作者',
    'modlist.col.version': '版本',
    'modlist.col.downloads': '下载量',
    'modlist.col.size': '大小',
    'modlist.working': '处理中...',
    'modlist.remove': '移除',
    'modlist.install': '安装',
    'modlist.showMore': '显示 {shown} / {total}',
    'modlist.unmanaged.title': '未管理的模组',
    'modlist.unmanaged.hint': '在 GameData 中检测到，但未被 CKAN 追踪',
    'modlist.unmanaged.badge': '未管理',
    'modlist.unmanaged.scanning': '正在扫描 GameData 文件夹...',
    'modlist.unmanaged.none': '未检测到未管理的模组',
    'modlist.provider.title': '选择提供者',
    'modlist.provider.desc': '{requester} 依赖于 {requested}。请选择要安装的提供者：',
    'modlist.provider.cancel': '取消',
    'modlist.detail.downloadPlural': '次下载',
    'modlist.detail.download': '下载',
    'modlist.detail.installedSize': '安装大小',
    'modlist.detail.compatibility': '兼容性',
    'modlist.detail.dependencies': '依赖项',
    'modlist.detail.conflicts': '冲突',
    'modlist.detail.versions': '版本',
    'modlist.detail.homepage': '主页',
    'modlist.detail.source': '源代码',
    'modlist.detail.spacedock': 'SpaceDock',
    'modlist.detail.bugtracker': '问题追踪',
    'modlist.uninstall': '卸载',
    'modlist.installMod': '安装模组',
    'modlist.detail.more': '还有 {count} 个',

    // ModList status toasts
    'modlist.status.installed': '{name} 已安装',
    'modlist.status.removed': '{name} 已移除',
    'modlist.status.updated': '{name} 已更新',
    'modlist.status.installFailed': '安装失败：{error}',
    'modlist.status.uninstallFailed': '卸载失败：{error}',
    'modlist.status.updateFailed': '更新失败：{error}',
    'modlist.status.genericError': '错误：{error}',
    'modlist.status.success': '安装成功',
    'modlist.status.devMode': '（开发模式）',

    // Downloads
    'downloads.title': '下载',
    'downloads.empty': '没有进行中的下载',
    'downloads.emptyHint': '开始安装模组后，会在这里显示',
    'downloads.clearHistory': '清除历史',
    'downloads.active': '进行中',
    'downloads.failed': '失败',
    'downloads.completed': '已完成',
    'downloads.installing': '安装中',
    'downloads.uninstalling': '卸载中',
    'downloads.started': '开始于',
    'downloads.installFailed': '安装失败',
    'downloads.uninstallFailed': '卸载失败',
    'downloads.installed': '已安装',
    'downloads.uninstalled': '已卸载',
    'downloads.retry': '重试',

    // Instances
    'instances.title': '游戏实例',
    'instances.refreshing': '刷新中...',
    'instances.refreshRepo': '刷新仓库',
    'instances.addInstance': '添加实例',
    'instances.addGameInstance': '添加游戏实例',
    'instances.instanceName': '实例名称',
    'instances.instanceNamePlaceholder': '例如：KSP 1.12 Modded',
    'instances.gamePath': '游戏路径',
    'instances.browse': '浏览',
    'instances.pathHint': '粘贴 KSP 安装文件夹的完整路径',
    'instances.kspVersion': 'KSP 版本',
    'instances.empty': '未找到游戏实例',
    'instances.emptyHint': '添加 Kerbal Space Program 安装以开始使用',
    'instances.addFirstGame': '添加第一个游戏',
    'instances.added': '添加于',
    'instances.downloadingRepo': '正在下载模组仓库...',
    'instances.repoUpdated': '仓库已更新 — 找到 {modCount} 个兼容模组',
    'instances.repoRefreshFailed': '刷新失败',
    'instances.syncing': '正在为新实例同步模组仓库...',
    'instances.selectKspFolder': '选择 KSP 安装文件夹',
    'instances.nameRequired': '名称为必填项',
    'instances.pathRequired': '游戏路径为必填项',
    'instances.failedToAdd': '添加实例失败',
    'instances.removeInstance': '移除实例',
    'instances.refreshRepoTooltip': '从 CKAN 仓库下载最新模组数据',
    'instances.scanning': '正在扫描 KSP 安装...',
    'instances.scanComplete': '扫描完成 — 找到 {count} 个实例',
    'instances.scanCompleteNone': '扫描完成 — 未找到 KSP 安装',
    'instances.scanFailed': '扫描失败：{error}',
    'instances.scanBtnTooltip': '扫描系统中的 KSP 安装',
    'instances.scanningBtn': '扫描中...',
    'instances.scanForGames': '扫描游戏',
    'instances.appLoading': '应用正在加载中，请稍后再试。',
    'instances.failedToBrowse': '无法打开文件夹浏览器',
    'instances.noResults': '无结果',
    'instances.active': '当前使用中',
    'instances.invalid': '无效',
    'instances.setActive': '设为当前实例',
    'instances.select': '选择',
    'instances.failedToRemove': '移除实例失败',
    'instances.failedToSwitch': '切换活动实例失败',

    // FAQ
    'faq.title': '常见问题与帮助',
    'faq.subtitle': '常见问题与已知问题',
    'faq.sectionTitle': '常见问题',
    'faq.knownIssues': '已知问题',
    'faq.knownBadge': '已知',
    'faq.workaround': '临时解决方法：',
    'faq.resources': '相关资源',
    'faq.githubRepo': 'GitHub 仓库',
    'faq.kspForums': 'KSP 论坛',
    'faq.officialCKAN': '官方 CKAN 项目',

    // Repos
    'repos.title': '仓库',
    'repos.defaultConfigured': '默认仓库已配置',
    'repos.defaultDesc': 'CKAN-meta 位于 github.com/KSP-CKAN/CKAN-meta',

    // AI Chat Panel
    'ai.title': 'CKAN AI',
    'ai.close': '关闭',
    'ai.provider': '提供商',
    'ai.model': '模型',
    'ai.customModel': '或输入模型 ID',
    'ai.customModelPlaceholder': '例如 anthropic/claude-3.5-sonnet',
    'ai.noApiKey': '未设置 API 密钥。请在设置中添加。',
    'ai.askAnything': '随便问...',
    'ai.poweredBy': '由 CKAN Cloud 提供支持',
    'ai.using': '使用 {provider}',
    'ai.ckanCloud': 'CKAN Cloud',
    'ai.noKey': '（无密钥）',
    'ai.errorOccurred': '抱歉，遇到问题：{error}。请重试。',
    'ai.signInRequired': '请登录以使用 CKAN AI。前往 设置 > 账户 创建免费账户。',

    // Update Banner
    'update.available': '有新版本可用',
    'update.install': '立即更新',
    'update.updating': '更新中...',
    'update.viewNotes': '查看更新日志',
    'update.noDownloadUrl': '发现新版本但无法获取下载链接。请手动下载。',
    'update.applyFailed': '更新失败。请从发布页面手动下载。',

    // Shift Config (Kerbal)
    'shift.assignments': '排班安排',
    'shift.assignDesc': '将 Kerbal 分配到白班或夜班。点击 Kerbal 可在两班之间移动。',
    'shift.dayShift': '白班 (06:00 – 18:00)',
    'shift.nightShift': '夜班 (18:00 – 06:00)',
    'shift.noAssigned': '未分配 Kerbal',
    'shift.kerbonaut': '航天员',
    'shift.saveChanges': '保存更改',
    'shift.saved': '已保存！',
    'shift.resetDefaults': '恢复默认',
    'shift.idleBanter': '空闲闲聊',
    'shift.enableIdle': '启用 Kerbal 空闲对话',
    'shift.enableIdleDesc': '玩家不活跃时，Kerbal 会互相聊天。',
    'shift.idleDelay': '空闲等待时间',
    'shift.minutes': '{n} 分钟',
    'shift.frequency': '对话频率',
    'shift.occasional': '偶尔',
    'shift.chatty': '频繁',
    'shift.tokenWarning': '空闲对话会消耗 API 额度。关闭可节省用量。',
    'shift.noResponse': '无响应。',

    // Room Canvas
    'room.title': 'CKAN 任务控制中心',
    'room.statusOk': '所有系统正常',
    'room.dayShift': '白班',
    'room.nightShift': '夜班',
    'room.crew': '{count} 名人员',
    'room.coffee': '咖啡',
  },
};

// ---------------------------------------------------------------------------
// Store (reactive language state)
// ---------------------------------------------------------------------------

type Listener = () => void;

let currentLang: Language = 'en';
const listeners = new Set<Listener>();

function getStoredLang(): Language {
  try {
    const saved = localStorage.getItem('ckan_language');
    if (saved === 'zh') return 'zh';
  } catch {}
  return 'en';
}

currentLang = getStoredLang();

function emitChange() {
  for (const fn of listeners) fn();
}

/** Translate with parameter interpolation. Falls back to English, then raw key. */
function translate(key: string, params?: Record<string, string | number>): string {
  let value =
    translations[currentLang]?.[key] ??
    translations.en[key] ??
    key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }

  return value;
}

/** Extract a human-readable message from an unknown error value. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : translate('common.unknownError');
}

/** The exported t function — works outside React. */
export const t: TranslateFn = translate;

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  if (lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem('ckan_language', lang);
  } catch {}
  emitChange();
}

export function subscribe(callback: Listener): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** i18n service object for compat with code that imports `i18n` */
export const i18n = {
  get language(): Language {
    return currentLang;
  },
  t: translate,
  setLanguage(lang: Language) {
    setLanguage(lang);
  },
  subscribe(callback: Listener) {
    return subscribe(callback);
  },
};

// ---------------------------------------------------------------------------
// React hook — reactive via useSyncExternalStore
// ---------------------------------------------------------------------------

function getSnapshot(): Language {
  return currentLang;
}

function getServerSnapshot(): Language {
  return 'en';
}

export function useT(): { t: TranslateFn; lang: Language } {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { t: translate, lang: currentLang };
}
