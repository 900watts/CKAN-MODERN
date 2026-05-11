import { useState } from 'react';
import { HelpCircle, ChevronDown, AlertTriangle, ExternalLink } from 'lucide-react';
import { useT } from '../services/i18n';
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
  { question: 'faq.q1.question', answer: 'faq.q1.answer' },
  { question: 'faq.q2.question', answer: 'faq.q2.answer' },
  { question: 'faq.q3.question', answer: 'faq.q3.answer' },
  { question: 'faq.q4.question', answer: 'faq.q4.answer' },
  { question: 'faq.q5.question', answer: 'faq.q5.answer' },
  { question: 'faq.q6.question', answer: 'faq.q6.answer' },
  { question: 'faq.q7.question', answer: 'faq.q7.answer' },
  { question: 'faq.q8.question', answer: 'faq.q8.answer' },
  { question: 'faq.q9.question', answer: 'faq.q9.answer' },
  { question: 'faq.q10.question', answer: 'faq.q10.answer' },
  { question: 'faq.q11.question', answer: 'faq.q11.answer' },
];

const KNOWN_ISSUES: KnownIssue[] = [
  { title: 'faq.issue1.title', description: 'faq.issue1.description', workaround: 'faq.issue1.workaround' },
  { title: 'faq.issue2.title', description: 'faq.issue2.description', workaround: 'faq.issue2.workaround' },
];

export default function FAQPage() {
  const { t } = useT();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('faq.title')}</h1>
        <p className={styles.subtitle}>{t('faq.subtitle')}</p>
      </div>

      <div className={styles.content}>
        {/* FAQ Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <HelpCircle size={16} />
            {t('faq.sectionTitle')}
          </div>

          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className={`${styles.faqItem} ${openIndex === i ? styles.faqItemOpen : ''}`}>
                <button className={styles.faqQuestion} onClick={() => toggle(i)}>
                  <span>{t(item.question)}</span>
                  <ChevronDown size={16} className={`${styles.chevron} ${openIndex === i ? styles.chevronOpen : ''}`} />
                </button>
                {openIndex === i && (
                  <div className={styles.faqAnswer}>{t(item.answer)}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Known Issues Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <AlertTriangle size={16} />
            {t('faq.knownIssues')}
          </div>

          <div className={styles.issuesList}>
            {KNOWN_ISSUES.map((issue, i) => (
              <div key={i} className={styles.issueCard}>
                <div className={styles.issueHeader}>
                  <span className={styles.issueBadge}>{t('faq.knownBadge')}</span>
                  <span className={styles.issueTitle}>{t(issue.title)}</span>
                </div>
                <p className={styles.issueDesc}>{t(issue.description)}</p>
                {issue.workaround && (
                  <div className={styles.workaround}>
                    <strong>{t('faq.workaround')}</strong> {t(issue.workaround)}
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
            {t('faq.resources')}
          </div>
          <div className={styles.linksCard}>
            <a href="https://github.com/900watts/CKAN-MODERN" target="_blank" rel="noopener noreferrer" className={styles.link}>
              {t('faq.githubRepo')}
              <ExternalLink size={12} />
            </a>
            <a href="https://forum.kerbalspaceprogram.com" target="_blank" rel="noopener noreferrer" className={styles.link}>
              {t('faq.kspForums')}
              <ExternalLink size={12} />
            </a>
            <a href="https://github.com/KSP-CKAN/" target="_blank" rel="noopener noreferrer" className={styles.link}>
              {t('faq.officialCKAN')}
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
