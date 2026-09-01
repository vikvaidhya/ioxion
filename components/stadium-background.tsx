/**
 * Decorative stadium-at-night backdrop: floodlight glow towers, a packed
 * crowd silhouette along the bottom with a sparse camera-flash sparkle
 * animation, and a faint stumps watermark. Pure CSS/SVG — no photos, no
 * external assets. Intended as an absolutely-positioned backdrop behind
 * real content (z-index below everything else).
 */
export function StadiumBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Night sky gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% -10%, #1a2e24 0%, #0d1712 55%, #070b09 100%)",
        }}
      />

      {/* Floodlight towers — soft cone glows from four corners */}
      {[
        { left: "8%", top: "-8%" },
        { left: "32%", top: "-10%" },
        { left: "68%", top: "-10%" },
        { left: "92%", top: "-8%" },
      ].map((pos, i) => (
        <div
          key={i}
          className="absolute w-[420px] h-[420px] rounded-full"
          style={{
            left: pos.left,
            top: pos.top,
            transform: "translate(-50%, 0)",
            background: "radial-gradient(circle, rgba(255,247,224,0.16) 0%, rgba(255,247,224,0.05) 40%, transparent 70%)",
          }}
        />
      ))}

      {/* Stumps watermark, faint, right side */}
      <svg
        className="absolute right-[4%] bottom-[18%] opacity-[0.05]"
        width="90"
        height="140"
        viewBox="0 0 90 140"
      >
        <rect x="8" y="10" width="6" height="120" fill="#FAF7F0" />
        <rect x="42" y="10" width="6" height="120" fill="#FAF7F0" />
        <rect x="76" y="10" width="6" height="120" fill="#FAF7F0" />
        <rect x="4" y="0" width="18" height="8" fill="#FAF7F0" />
        <rect x="38" y="0" width="18" height="8" fill="#FAF7F0" />
        <rect x="72" y="0" width="18" height="8" fill="#FAF7F0" />
      </svg>

      {/* Crowd silhouette strip along the bottom, with sparse camera flashes */}
      <div className="absolute bottom-0 left-0 right-0 h-24">
        <svg width="100%" height="100%" viewBox="0 0 800 100" preserveAspectRatio="none">
          <path
            d="M0,100 L0,55 Q20,45 40,55 T80,55 T120,50 T160,58 T200,48 T240,55 T280,50 T320,58 T360,50 T400,55 T440,48 T480,55 T520,50 T560,58 T600,48 T640,55 T680,50 T720,58 T760,50 T800,55 L800,100 Z"
            fill="#050a07"
          />
        </svg>
        {/* Camera flash sparkles */}
        {[
          { left: "12%", delay: "0s" },
          { left: "27%", delay: "1.4s" },
          { left: "41%", delay: "0.6s" },
          { left: "58%", delay: "2.1s" },
          { left: "73%", delay: "0.3s" },
          { left: "86%", delay: "1.8s" },
        ].map((s, i) => (
          <span
            key={i}
            className="absolute bottom-8 w-1 h-1 rounded-full bg-white camera-flash"
            style={{ left: s.left, animationDelay: s.delay }}
          />
        ))}
      </div>

      <style>{`
        @keyframes camera-flash {
          0%, 92%, 100% { opacity: 0; transform: scale(1); }
          94% { opacity: 0.9; transform: scale(2.2); }
          97% { opacity: 0; transform: scale(1); }
        }
        .camera-flash {
          animation: camera-flash 3.5s ease-in-out infinite;
          box-shadow: 0 0 6px 2px rgba(255,255,255,0.8);
        }
        @media (prefers-reduced-motion: reduce) {
          .camera-flash { animation: none; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
