import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";

export const PIP_SPEECHES = [
  "Let's go! 🙌",
  "Where to? 🗺️",
  "Pack your bags!",
  "Adventure awaits! 🌍",
  "I love trips! 🧳",
  "Ready when you are!",
  "This is gonna be so fun!",
  "I'm so excited! 🎉",
];

function Eye({ blink, happy, px, py }: { blink: boolean; happy: boolean; px: number; py: number }) {
  return (
    <div className="relative w-5 h-5 rounded-full bg-white overflow-hidden flex items-center justify-center">
      <AnimatePresence mode="wait">
        {happy ? (
          <motion.div
            key="happy"
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
              <path d="M1 7 Q7 1 13 7" stroke="#312e81" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </motion.div>
        ) : (
          <motion.div
            key="normal"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              animate={{ scaleY: blink ? 0.05 : 1 }}
              transition={{ duration: blink ? 0.07 : 0.13, ease: "easeInOut" }}
              style={{ transformOrigin: "center" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <motion.div
                className="relative w-3 h-3 rounded-full bg-indigo-900"
                animate={{ x: px, y: py }}
                transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.5 }}
              >
                <div className="absolute inset-0.5 rounded-full bg-indigo-950" />
                <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-white/80" />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PipCharacter({ speeches = PIP_SPEECHES }: { speeches?: string[] }) {
  const [blink, setBlink] = useState(false);
  const [happy, setHappy] = useState(false);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [speech, setSpeech] = useState("");
  const [showSpeech, setShowSpeech] = useState(false);
  const speechIdxRef = useRef(0);
  const speechTimeout = useRef<ReturnType<typeof setTimeout>>();
  const happyTimeout = useRef<ReturnType<typeof setTimeout>>();
  const pipRef = useRef<HTMLDivElement>(null);
  const bodyControls = useAnimationControls();

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          if (Math.random() < 0.25) {
            setTimeout(() => { setBlink(true); setTimeout(() => { setBlink(false); schedule(); }, 100); }, 200);
          } else {
            schedule();
          }
        }, 110);
      }, 2000 + Math.random() * 3200);
    };
    schedule();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!pipRef.current) return;
      const rect = pipRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const angle = Math.atan2(dy, dx);
      const reach = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 120);
      setPupil({ x: Math.cos(angle) * 2.5 * reach, y: Math.sin(angle) * 2.5 * reach });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const handleClick = () => {
    clearTimeout(speechTimeout.current);
    clearTimeout(happyTimeout.current);
    const msg = speeches[speechIdxRef.current % speeches.length];
    speechIdxRef.current += 1;
    setSpeech(msg);
    setShowSpeech(true);
    setHappy(true);
    speechTimeout.current = setTimeout(() => setShowSpeech(false), 2200);
    happyTimeout.current = setTimeout(() => setHappy(false), 700);
    bodyControls.start({
      x: [0, -10, 10, -8, 8, -4, 4, 0],
      y: [0, -18, -4, -12, 0],
      rotate: [0, -6, 6, -4, 4, 0],
      scale: [1, 1.08, 0.95, 1.04, 1],
      transition: { duration: 0.65, ease: "easeOut" },
    });
  };

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {showSpeech && (
          <motion.div
            key={speech}
            initial={{ opacity: 0, y: 6, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white dark:bg-zinc-800 text-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-md border border-border z-10"
          >
            {speech}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white dark:bg-zinc-800 border-r border-b border-border" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        ref={pipRef}
        animate={bodyControls}
        onClick={handleClick}
        className="cursor-pointer select-none"
        aria-label="Click Pip"
      >
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="relative" style={{ width: 80, height: 96 }}>
            <div className="absolute inset-4 rounded-2xl bg-violet-400/20 blur-2xl" />
            <div
              className="absolute left-1/2 -translate-x-1/2 border-2 border-indigo-300 rounded-t-full bg-transparent"
              style={{ top: 0, width: 28, height: 14 }}
            />
            <div
              className="absolute left-0 right-0 rounded-2xl bg-gradient-to-b from-violet-400 to-indigo-500 shadow-lg"
              style={{ top: 10, bottom: 6 }}
            >
              <div className="absolute left-0 right-0 flex justify-center gap-4" style={{ top: 16 }}>
                <Eye blink={blink} happy={happy} px={pupil.x} py={pupil.y} />
                <Eye blink={blink} happy={happy} px={pupil.x} py={pupil.y} />
              </div>
              <div className="absolute left-0 right-0 flex justify-between px-2.5" style={{ top: 34 }}>
                <div className="w-3 h-2 rounded-full bg-pink-300/20" />
                <div className="w-3 h-2 rounded-full bg-pink-300/20" />
              </div>
              <div className="absolute left-0 right-0 flex justify-center" style={{ top: 35 }}>
                <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
                  <path d="M2 2 Q10 9 18 2" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2">
              <div className="w-5 h-5 rounded-full bg-indigo-700 border-2 border-indigo-500 shadow-md" />
              <div className="w-5 h-5 rounded-full bg-indigo-700 border-2 border-indigo-500 shadow-md" />
            </div>
          </div>
          <div className="mt-2 text-center text-xs font-semibold text-violet-400/60 tracking-widest">pip</div>
        </motion.div>
      </motion.div>
    </div>
  );
}
