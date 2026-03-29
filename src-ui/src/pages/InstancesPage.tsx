import { motion } from 'framer-motion';
import { HardDrive, Plus, Gamepad2 } from 'lucide-react';
import styles from './InstancesPage.module.css';

export default function InstancesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Game Instances</h1>
        <button className={styles.addBtn}>
          <Plus size={16} />
          Add Instance
        </button>
      </div>
      <div className={styles.content}>
        <motion.div
          className={styles.empty}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Gamepad2 size={48} className={styles.emptyIcon} />
          <h2>No game instances found</h2>
          <p>Add a Kerbal Space Program installation to get started</p>
          <button className={styles.addBtnLarge}>
            <Plus size={16} />
            Add Your First Game
          </button>
        </motion.div>
      </div>
    </div>
  );
}
