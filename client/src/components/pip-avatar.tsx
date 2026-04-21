import { motion } from "framer-motion";

export function PipAvatar() {
  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: 28, height: 34 }}
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Antenna — ball on stick */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: -2 }}>
        <div className="rounded-full bg-violet-200" style={{ width: 4, height: 4 }} />
        <div className="rounded-full bg-violet-300" style={{ width: 2, height: 6, marginTop: -1 }} />
      </div>

      {/* Body */}
      <div
        className="absolute left-0 right-0 rounded-xl bg-gradient-to-b from-violet-300 to-violet-500 shadow-sm"
        style={{ top: 6, bottom: 5 }}
      >
        {/* Eyes */}
        <div className="absolute left-0 right-0 flex justify-center gap-1.5" style={{ top: 4 }}>
          {[0, 1].map((i) => (
            <div key={i} className="rounded-full bg-white flex items-center justify-center" style={{ width: 6, height: 6 }}>
              <div className="rounded-full bg-violet-500" style={{ width: 3, height: 3 }} />
            </div>
          ))}
        </div>

        {/* Cheeks */}
        <div className="absolute left-0 right-0 flex justify-between" style={{ top: 11, paddingLeft: 2, paddingRight: 2 }}>
          <div className="rounded-full bg-rose-300/60" style={{ width: 4, height: 2 }} />
          <div className="rounded-full bg-rose-300/60" style={{ width: 4, height: 2 }} />
        </div>

        {/* Smile */}
        <div className="absolute left-0 right-0 flex justify-center" style={{ top: 11 }}>
          <svg width="10" height="5" viewBox="0 0 10 5" fill="none">
            <path d="M1 1 Q5 5.5 9 1" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Feet */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
        <div className="rounded-full bg-violet-500 border border-violet-300" style={{ width: 6, height: 6 }} />
        <div className="rounded-full bg-violet-500 border border-violet-300" style={{ width: 6, height: 6 }} />
      </div>
    </motion.div>
  );
}
