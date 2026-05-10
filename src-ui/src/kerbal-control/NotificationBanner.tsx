/**
 * NotificationBanner — Non-intrusive toast for proactive kerbal messages
 * when the user is on a different page. Click navigates to Mission Control.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BannerMessage {
  kerbalName: string;
  preview: string;
  timestamp: number;
}

interface NotificationBannerProps {
  message: BannerMessage | null;
  onNavigate: () => void;
}

// ---------------------------------------------------------------------------
// NotificationBanner
// ---------------------------------------------------------------------------

const NotificationBanner: React.FC<NotificationBannerProps> = ({ message, onNavigate }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [message?.timestamp, message?.kerbalName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {visible && message && (
        <motion.div
          initial={{ opacity: 0, x: 100, y: -20 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="fixed top-20 right-6 z-50 max-w-xs cursor-pointer"
          onClick={onNavigate}
        >
          <div className="bg-gray-800/95 backdrop-blur border border-orange-500/30 rounded-xl px-4 py-3 shadow-2xl shadow-orange-500/10 hover:border-orange-500/60 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-600/80 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {message.kerbalName.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-orange-400 mb-0.5">
                  {message.kerbalName}
                </p>
                <p className="text-xs text-gray-300 leading-snug line-clamp-2">
                  {message.preview}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationBanner;
