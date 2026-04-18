export function PipAvatar() {
  return (
    <div className="relative shrink-0" style={{ width: 28, height: 34 }}>
      {/* Handle */}
      <div
        className="absolute left-1/2 -translate-x-1/2 border border-indigo-300 rounded-t-full bg-transparent"
        style={{ top: 0, width: 12, height: 6 }}
      />
      {/* Body */}
      <div
        className="absolute left-0 right-0 rounded-lg bg-gradient-to-b from-violet-400 to-indigo-500 shadow-sm"
        style={{ top: 5, bottom: 5 }}
      >
        {/* Eyes */}
        <div className="absolute left-0 right-0 flex justify-center gap-1.5" style={{ top: 5 }}>
          {[0, 1].map((i) => (
            <div key={i} className="rounded-full bg-white flex items-center justify-center" style={{ width: 5, height: 5 }}>
              <div className="rounded-full bg-indigo-950" style={{ width: 3, height: 3 }} />
            </div>
          ))}
        </div>
        {/* Smile */}
        <div className="absolute left-0 right-0 flex justify-center" style={{ top: 12 }}>
          <svg width="9" height="4" viewBox="0 0 9 4" fill="none">
            <path d="M1 1 Q4.5 4.5 8 1" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {/* Wheels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-0.5">
        <div className="rounded-full bg-indigo-700" style={{ width: 6, height: 6 }} />
        <div className="rounded-full bg-indigo-700" style={{ width: 6, height: 6 }} />
      </div>
    </div>
  );
}
