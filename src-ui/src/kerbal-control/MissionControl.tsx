import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Smartphone } from 'lucide-react';
import { kerbalStore } from './KerbalStore';
import { timeSystem } from './TimeSystem';
import { SoulLoader } from './SoulLoader';
import ChatBar from './Chat/ChatBar';
import RoomCanvas from './Room/RoomCanvas';
import SmartphoneModal from './Chat/SmartphoneModal';
import { idleBanter } from './Chat/IdleBanter';
import type { BanterMessage } from './Chat/IdleBanter';
import { t } from '../services/i18n';
import { worldContext } from './WorldContext';
import { moodSystem } from './MoodSystem';
import { proactiveAgent } from './ProactiveAgent';
import type { ProactiveMessage } from './ProactiveAgent';
import { storyEngine } from './StoryEngine';
import NotificationBanner from './NotificationBanner';
import type { BannerMessage } from './NotificationBanner';

export default function MissionControl() {
  const [smartphoneOpen, setSmartphoneOpen] = useState(false);
  const [soulsLoaded, setSoulsLoaded] = useState(false);
  const [shiftNotification, setShiftNotification] = useState<string | null>(null);

  /** Banter messages collected from idleBanter, passed down to ChatBar. */
  const [banterMessages, setBanterMessages] = useState<BanterMessage[]>([]);
  const [proactiveMessages, setProactiveMessages] = useState<ProactiveMessage[]>([]);
  const [bannerMessage, setBannerMessage] = useState<BannerMessage | null>(null);

  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateShiftPresence = () => {
    const time = timeSystem.getTime();
    const isDaytime = time.shiftType === 'day';
    const assignments = kerbalStore.getShiftAssignmentsByShift();
    const presentNames = isDaytime ? assignments.day : assignments.night;
    kerbalStore.setPresentKerbals(presentNames);
  };

  const showNotification = (message: string) => {
    setShiftNotification(message);
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = setTimeout(() => setShiftNotification(null), 5000);
  };

  // -----------------------------------------------------------------------
  // Idle-banter activity callback (user typed or clicked chat)
  // -----------------------------------------------------------------------

  const handleChatActivity = useCallback(() => {
    idleBanter.markActivity();
  }, []);

  // -----------------------------------------------------------------------
  // Mount / lifecycle
  // -----------------------------------------------------------------------

  useEffect(() => {
    worldContext.init();
    moodSystem.start();
    proactiveAgent.start();
    timeSystem.start();

    Promise.all(SoulLoader.getAllNames().map((name) => SoulLoader.load(name)))
      .then(() => setSoulsLoaded(true))
      .catch(() => setSoulsLoaded(true));

    updateShiftPresence();

    // Start idle banter monitoring
    idleBanter.start();

    // Subscribe to banter events (capped at 200 to prevent unbounded growth)
    const unsubBanter = idleBanter.onBanter((message: BanterMessage) => {
      setBanterMessages((prev) => [...prev.slice(-199), message]);
    });

    const unsubProactive = proactiveAgent.onMessage((msg: ProactiveMessage) => {
      setProactiveMessages((prev) => [...prev.slice(-199), msg]);
      setBannerMessage({
        kerbalName: msg.kerbalName,
        preview: msg.content.slice(0, 80),
        timestamp: msg.timestamp,
      });
    });

    const timeUnsub = timeSystem.subscribe(() => {
      // Time tick — shift detection handled below
    });

    let lastShift = timeSystem.getTime().shiftType;
    const shiftCheckUnsub = timeSystem.subscribe(() => {
      const time = timeSystem.getTime();
      if (time.shiftType !== lastShift) {
        lastShift = time.shiftType;
        const assignments = kerbalStore.getShiftAssignmentsByShift();
        const incomingShift = time.shiftType === 'day' ? assignments.day : assignments.night;
        kerbalStore.setPresentKerbals(incomingShift);

        if (time.shiftType === 'day') {
          showNotification(t('mc.dayShift'));
        } else {
          showNotification(t('mc.nightShift'));
        }
      }
    });

    return () => {
      worldContext.destroy();
      moodSystem.stop();
      proactiveAgent.stop();
      timeSystem.stop();
      idleBanter.stop();
      timeUnsub();
      shiftCheckUnsub();
      unsubBanter();
      unsubProactive();
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 relative">
      {/* Shift notification banner */}
      <AnimatePresence>
        {shiftNotification && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center"
          >
            <div className="px-6 py-2 rounded-b-lg bg-orange-600/90 text-white text-sm font-medium shadow-lg backdrop-blur-sm">
              {shiftNotification}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      <AnimatePresence>
        {!soulsLoaded && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-gray-950"
          >
            <div className="text-center w-full">
              <div className="w-10 h-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-sm">{t('mc.loading')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room area — 55% height for better chat balance */}
      <div className="relative flex-shrink-0" style={{ height: '55%' }}>
        <RoomCanvas />
      </div>

      {/* Divider with smartphone button */}
      <div className="relative flex-shrink-0 bg-gray-900 border-t border-b border-gray-800" style={{ height: '4px' }}>
        <div className="absolute right-6 -top-6">
          <button
            onClick={() => setSmartphoneOpen(true)}
            className="flex items-center justify-center w-12 h-12 rounded-full
              bg-gray-800 border border-gray-700 hover:border-orange-500/50
              hover:bg-gray-750 transition-all duration-200
              shadow-lg hover:shadow-orange-500/20
              focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            title={t('mc.openPhone')}
          >
            <Smartphone size={22} className="text-gray-400 hover:text-orange-400 transition-colors" />
          </button>
        </div>
      </div>

      {/* Chat area — fills remaining space */}
      <div className="flex-1 min-h-0">
        <ChatBar
          banterMessages={banterMessages}
          proactiveMessages={proactiveMessages}
          onActivity={handleChatActivity}
          onOpenPhone={() => setSmartphoneOpen(true)}
        />
      </div>

      {/* Smartphone modal */}
      <SmartphoneModal isOpen={smartphoneOpen} onClose={() => setSmartphoneOpen(false)} />

      <NotificationBanner
        message={bannerMessage}
        onNavigate={() => {
          setBannerMessage(null);
        }}
      />
    </div>
  );
}
