import { useState, useEffect } from 'react';
import { kerbalStore } from '../KerbalStore';
import type { ShiftAssignment } from '../KerbalStore';
import type { IdleConfig } from '../Chat/IdleBanter';
import { useT } from '../../services/i18n';

const DEFAULT_DAY_SHIFT: string[] = ['Jebediah', 'Bill', 'Valentina', 'Bob', 'Wernher'];
const DEFAULT_NIGHT_SHIFT: string[] = ['Bobak', 'Gene', 'Mortimer', 'Linus', 'Walt'];

const IDLE_DELAY_OPTIONS = [3, 5, 10, 15];
const FREQUENCY_OPTIONS: { value: IdleConfig['frequency']; label: string }[] = [
  { value: 'occasional', label: 'Occasional' },
  { value: 'chatty', label: 'Chatty' },
];

const suitColors: Record<string, string> = {
  Jebediah: '#F4A460',
  Bill: '#6495ED',
  Bob: '#3CB371',
  Valentina: '#FF69B4',
  Wernher: '#DDA0DD',
  Bobak: '#FF8C00',
  Gene: '#4169E1',
  Mortimer: '#8B4513',
  Linus: '#2E8B57',
  Walt: '#CD853F',
};

function getSuitColor(name: string): string {
  return suitColors[name] || '#888888';
}

interface ShiftConfigProps {
  enabled: boolean;
  delayMinutes: number;
  frequency: IdleConfig['frequency'];
  onToggle: (enabled: boolean) => void;
  onDelayChange: (minutes: number) => void;
  onFrequencyChange: (freq: IdleConfig['frequency']) => void;
}

export default function ShiftConfig({
  enabled,
  delayMinutes,
  frequency,
  onToggle,
  onDelayChange,
  onFrequencyChange,
}: ShiftConfigProps) {
  const { t } = useT();
  const [dayShift, setDayShift] = useState<string[]>([]);
  const [nightShift, setNightShift] = useState<string[]>([]);
  const [movingKerbals, setMovingKerbals] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const grouped = kerbalStore.getShiftAssignmentsByShift();
    if (grouped.day.length > 0 || grouped.night.length > 0) {
      setDayShift(grouped.day);
      setNightShift(grouped.night);
    } else {
      setDayShift([...DEFAULT_DAY_SHIFT]);
      setNightShift([...DEFAULT_NIGHT_SHIFT]);
    }
  }, []);

  const moveToNight = (name: string) => {
    setMovingKerbals((prev) => new Set(prev).add(name));
    setTimeout(() => {
      setDayShift((prev) => prev.filter((k) => k !== name));
      setNightShift((prev) => [...prev, name]);
      setMovingKerbals((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setSaved(false);
    }, 300);
  };

  const moveToDay = (name: string) => {
    setMovingKerbals((prev) => new Set(prev).add(name));
    setTimeout(() => {
      setNightShift((prev) => prev.filter((k) => k !== name));
      setDayShift((prev) => [...prev, name]);
      setMovingKerbals((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setSaved(false);
    }, 300);
  };

  const handleSave = () => {
    const assignments: ShiftAssignment[] = [
      ...dayShift.map((name) => ({ kerbalName: name, shift: 'day' as const })),
      ...nightShift.map((name) => ({ kerbalName: name, shift: 'night' as const })),
    ];
    kerbalStore.setShiftAssignments(assignments);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setDayShift([...DEFAULT_DAY_SHIFT]);
    setNightShift([...DEFAULT_NIGHT_SHIFT]);
    setSaved(false);
  };

  const renderKerbalCard = (name: string, onClick: () => void) => {
    const isMoving = movingKerbals.has(name);
    return (
      <div
        key={name}
        onClick={onClick}
        className={`
          flex items-center gap-3 p-3 rounded-lg cursor-pointer
          transition-all duration-300 ease-in-out
          bg-gray-800 border border-gray-700 hover:border-orange-500/50
          hover:bg-gray-750
          ${isMoving ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100'}
        `}
      >
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: getSuitColor(name) }}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-200 truncate">{name}</div>
          <div className="text-xs text-gray-500">{t('shift.kerbonaut')}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Shift Assignment Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">{t('shift.assignments')}</h3>
        <p className="text-sm text-gray-400 mb-6">
          {t('shift.assignDesc')}
        </p>

        <div className="grid grid-cols-2 gap-6">
          {/* Day Shift Column */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <h4 className="text-sm font-medium text-amber-400">
                {t('shift.dayShift')}
              </h4>
            </div>
            <div className="space-y-2 min-h-[100px] p-2 rounded-lg border border-dashed border-gray-700 bg-gray-900/50">
              {dayShift.length === 0 ? (
                <div className="text-xs text-gray-600 text-center py-4">
                  {t('shift.noAssigned')}
                </div>
              ) : (
                dayShift.map((name) => renderKerbalCard(name, () => moveToNight(name)))
              )}
            </div>
          </div>

          {/* Night Shift Column */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-indigo-400" />
              <h4 className="text-sm font-medium text-indigo-400">
                {t('shift.nightShift')}
              </h4>
            </div>
            <div className="space-y-2 min-h-[100px] p-2 rounded-lg border border-dashed border-gray-700 bg-gray-900/50">
              {nightShift.length === 0 ? (
                <div className="text-xs text-gray-600 text-center py-4">
                  {t('shift.noAssigned')}
                </div>
              ) : (
                nightShift.map((name) => renderKerbalCard(name, () => moveToDay(name)))
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500
              text-white text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            {saved ? t('shift.saved') : t('shift.saveChanges')}
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600
              text-gray-300 text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-gray-500/50"
          >
            {t('shift.resetDefaults')}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800" />

      {/* Idle Banter Settings Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">{t('shift.idleBanter')}</h3>

        <div className="space-y-5">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-200">
                {t('shift.enableIdle')}
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('shift.enableIdleDesc')}
              </p>
            </div>
            <button
              onClick={() => onToggle(!enabled)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-orange-500/50
                ${enabled ? 'bg-orange-600' : 'bg-gray-700'}
              `}
              role="switch"
              aria-checked={enabled}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white
                  transition-transform duration-200
                  ${enabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* Idle Delay Select */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {t('shift.idleDelay')}
            </label>
            <select
              value={delayMinutes}
              onChange={(e) => onDelayChange(Number(e.target.value))}
              disabled={!enabled}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700
                text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {IDLE_DELAY_OPTIONS.map((mins) => (
                <option key={mins} value={mins}>
                  {t('shift.minutes', { n: mins })}
                </option>
              ))}
            </select>
          </div>

          {/* Frequency Select */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {t('shift.frequency')}
            </label>
            <select
              value={frequency}
              onChange={(e) => onFrequencyChange(e.target.value as IdleConfig['frequency'])}
              disabled={!enabled}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700
                text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === 'occasional' ? t('shift.occasional') : t('shift.chatty')}
                </option>
              ))}
            </select>
          </div>

          {/* Token Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <svg
              className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
              />
            </svg>
            <p className="text-xs text-amber-400/80">
              {t('shift.tokenWarning')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
