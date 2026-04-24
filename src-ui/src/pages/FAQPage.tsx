import { useState } from 'react';
import { HelpCircle, ChevronDown, AlertTriangle, ExternalLink } from 'lucide-react';
import styles from './FAQPage.module.css';

interface FAQItem {
  question: string;
  answer: string;
}

interface KnownIssue {
  title: string;
  description: string;
  workaround?: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is CKAN Modern?',
    answer: 'A mod manager for Kerbal Space Program, rebuilt from scratch in .NET 8 WPF with a React-based UI. It uses real CKAN repository data and works alongside the original CKAN.',
  },
  {
    question: 'Is this the official CKAN?',
    answer: 'No. This is a community project, not affiliated with the original CKAN team. The original CKAN remains fully supported.',
  },
  {
    question: 'Why does the app ask me to sign in? Is it required?',
    answer: 'Sign-in is optional. The core mod manager features work without an account. Signing in uses Supabase authentication and is only needed for optional features like AI assistant access and cloud sync.',
  },
  {
    question: 'What data do you collect about me?',
    answer: 'If you choose to sign in, only your email address is stored via Supabase. We do not collect gameplay data, system information, or any other personal info. No tracking. No analytics. Your mod configs (if you opt in to cloud sync) are stored only under your account and are inaccessible to anyone else.',
  },
  {
    question: 'What is Cloud Sync?',
    answer: 'It lets you save and restore your mod lists, instance configs, and repository settings so you can move your setup between computers. You can also export everything as local backup files and store them wherever you want \u2014 Dropbox, OneDrive, Google Drive, wherever.',
  },
  {
    question: 'What is the AI Assistant?',
    answer: 'A built-in chat panel where you can ask mod-related questions in plain English. It queries the CKAN mod database combined with an LLM (via the Silicon Flow API) to give contextual answers like "what mods work well together for a station build?"',
  },
  {
    question: 'Does the AI cost money?',
    answer: 'Each AI query calls an external API that has usage costs. The free tier gives you a limited number of queries per day. If you need more, a paid tier is planned (see below). The core mod manager will always be free.',
  },
  {
    question: 'What would paid tiers include?',
    answer: 'Still in planning, but likely: higher AI query limits, and possibly priority feature requests. No core mod management features will ever be paywalled. The paid tiers only cover ongoing costs like AI API usage.',
  },
  {
    question: 'Where does the mod data come from?',
    answer: 'Directly from the official CKAN-NetKAN/meta repository (github.com/KSP-CKAN/). The same data source the original CKAN uses.',
  },
  {
    question: 'Is the app open source?',
    answer: 'Yes. Full source code at github.com/900watts/CKAN-MODERN under MIT license.',
  },
  {
    question: 'When is the next release?',
    answer: 'No fixed date. The project is still early. Follow the GitHub repo for updates and release notes.',
  },
];

const KNOWN_ISSUES: KnownIssue[] = [
  {
    title: 'Mod install/uninstall occasionally fails',
    description: 'Some users report that installing or removing mods does not always work on the first attempt. The operation may silently fail or hang.',
    workaround: 'Retry the operation. If it still fails, restart the app and try again. This is a known bug being actively investigated.',
  },
  {
    title: 'New instances not detected on first launch',
    description: 'After adding a KSP game instance, the app may not detect it immediately. Some users report needing to open and close the app multiple times (5\u201310 times) before the instance is recognized.',
    workaround: 'Close and reopen the app. Repeat if necessary until the instance appears. A fix is in progress.',
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>FAQ &amp; Help</h1>
        <p className={styles.subtitle}>Frequently asked questions and known issues</p>
      </div>

      <div className={styles.content}>
        {/* FAQ Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <HelpCircle size={16} />
            Frequently Asked Questions
          </div>

          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className={`${styles.faqItem} ${openIndex === i ? styles.faqItemOpen : ''}`}>
                <button className={styles.faqQuestion} onClick={() => toggle(i)}>
                  <span>{item.question}</span>
                  <ChevronDown size={16} className={`${styles.chevron} ${openIndex === i ? styles.chevronOpen : ''}`} />
                </button>
                {openIndex === i && (
                  <div className={styles.faqAnswer}>{item.answer}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Known Issues Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <AlertTriangle size={16} />
            Known Issues
          </div>

          <div className={styles.issuesList}>
            {KNOWN_ISSUES.map((issue, i) => (
              <div key={i} className={styles.issueCard}>
                <div className={styles.issueHeader}>
                  <span className={styles.issueBadge}>Known</span>
                  <span className={styles.issueTitle}>{issue.title}</span>
                </div>
                <p className={styles.issueDesc}>{issue.description}</p>
                {issue.workaround && (
                  <div className={styles.workaround}>
                    <strong>Workaround:</strong> {issue.workaround}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <ExternalLink size={16} />
            Resources
          </div>
          <div className={styles.linksCard}>
            <a href="https://github.com/900watts/CKAN-MODERN" target="_blank" rel="noopener noreferrer" className={styles.link}>
              GitHub Repository
              <ExternalLink size={12} />
            </a>
            <a href="https://forum.kerbalspaceprogram.com" target="_blank" rel="noopener noreferrer" className={styles.link}>
              KSP Forums
              <ExternalLink size={12} />
            </a>
            <a href="https://github.com/KSP-CKAN/" target="_blank" rel="noopener noreferrer" className={styles.link}>
              Official CKAN Project
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
