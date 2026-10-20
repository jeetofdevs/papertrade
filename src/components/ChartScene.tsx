// UWU mode chart backdrop: a cozy bedroom window at night. Original artwork, drawn in SVG.

// Fixed pseudo-random stars, so the sky looks the same on every render.
let seed = 42;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const STARS = Array.from({ length: 90 }, () => ({ x: 165 + rnd() * 870, y: 40 + rnd() * 340, s: 0.6 + rnd() * 1.8, o: 0.35 + rnd() * 0.65 }));

const BULBS = ['#ff9ecf', '#ffe27a', '#7ff0c4', '#9db0ff', '#ffb38a'];

/** UWU-less backdrop: just the night sky with stars and comets. */
function SkyScene() {
  return (
    <svg className="chart-scene" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky-only" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262467" />
          <stop offset="0.65" stopColor="#3b3486" />
          <stop offset="1" stopColor="#5b4a9c" />
        </linearGradient>
        <radialGradient id="comet-head">
          <stop offset="0" stopColor="#e6fbff" />
          <stop offset="0.4" stopColor="#7fd8ff" />
          <stop offset="1" stopColor="#7fd8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="comet-tail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7fd8ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#7fd8ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1200" height="600" fill="url(#sky-only)" />
      {SKY_STARS.map((st, i) => (
        <circle key={i} className={i % 6 === 0 ? 'cs-twinkle' : undefined} cx={st.x} cy={st.y} r={st.s} fill="#fff" opacity={st.o} />
      ))}
      {[
        [470, 190, 0],
        [720, 260, 2.5],
        [1080, 40, 5],
      ].map(([x, y, delay], i) => (
        <g key={i} className="sky-comet" style={{ animationDelay: `${delay}s` }} transform={`translate(${x} ${y}) rotate(-24)`}>
          <rect x="0" y="-3" width="260" height="6" rx="3" fill="url(#comet-tail)" />
          <circle cx="0" cy="0" r="12" fill="url(#comet-head)" />
        </g>
      ))}
      <g stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.5" strokeLinecap="round">
        <path d="M300 160 l-140 60" />
        <path d="M940 470 l-140 60" />
        <path d="M1110 330 l-60 26" />
      </g>
    </svg>
  );
}

const SKY_STARS = Array.from({ length: 160 }, () => ({ x: rnd() * 1200, y: rnd() * 600, s: 0.6 + rnd() * 1.9, o: 0.3 + rnd() * 0.7 }));

export function ChartScene({ variant = 'room' }: { variant?: 'room' | 'sky' }) {
  if (variant === 'sky') return <SkyScene />;
  return (
    <svg className="chart-scene" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#181350" />
          <stop offset="0.6" stopColor="#2d2382" />
          <stop offset="1" stopColor="#4a3aa3" />
        </linearGradient>
        <linearGradient id="cs-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2f77" />
          <stop offset="1" stopColor="#2a2160" />
        </linearGradient>
        <linearGradient id="cs-curtain" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#bfa8ff" />
          <stop offset="0.5" stopColor="#d9ccff" />
          <stop offset="1" stopColor="#a991f2" />
        </linearGradient>
        <radialGradient id="cs-glow">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="cs-moon">
          <rect width="1200" height="600" fill="#fff" />
          <circle cx="866" cy="98" r="27" fill="#000" />
        </mask>
        <clipPath id="cs-window">
          <rect x="150" y="30" width="900" height="420" rx="26" />
        </clipPath>
      </defs>

      {/* wall */}
      <rect width="1200" height="600" fill="url(#cs-wall)" />
      <g fill="#ffffff" opacity="0.04">
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={(i * 113) % 1200} cy={(i * 71) % 600} r="18" />
        ))}
      </g>

      {/* window with the night sky */}
      <g clipPath="url(#cs-window)">
        <rect x="150" y="30" width="900" height="420" fill="url(#cs-sky)" />
        {STARS.map((s, i) => (
          <circle key={i} className={i % 5 === 0 ? 'cs-twinkle' : undefined} cx={s.x} cy={s.y} r={s.s} fill="#fff" opacity={s.o} />
        ))}
        {/* moon */}
        <circle cx="880" cy="110" r="46" fill="url(#cs-glow)" opacity="0.35" />
        <circle cx="880" cy="110" r="30" fill="#fff4d6" mask="url(#cs-moon)" />
        {/* shooting stars */}
        <path className="cs-shoot" d="M760 70 l-120 46" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <path className="cs-shoot cs-shoot-2" d="M520 50 l-100 38" stroke="#bde6ff" strokeWidth="2" strokeLinecap="round" />
        {/* far clouds */}
        <g fill="#ffffff" opacity="0.16">
          <ellipse cx="300" cy="380" rx="130" ry="30" />
          <ellipse cx="760" cy="400" rx="170" ry="34" />
        </g>
      </g>
      {/* window frame */}
      <rect x="150" y="30" width="900" height="420" rx="26" fill="none" stroke="#e9e2ff" strokeWidth="14" />
      <path d="M600 30 V450 M150 240 H1050" stroke="#e9e2ff" strokeWidth="9" opacity="0.9" />
      <rect x="130" y="440" width="940" height="22" rx="10" fill="#f1ebff" />

      {/* fairy lights */}
      <path d="M120 40 Q600 150 1080 40" fill="none" stroke="#2b2350" strokeWidth="2.5" />
      {Array.from({ length: 15 }, (_, i) => {
        const t = (i + 1) / 16;
        const x = 120 + t * 960;
        const y = 40 + 4 * 110 * t * (1 - t) - 1;
        return (
          <g key={i} className="cs-bulb" style={{ animationDelay: `${(i % 5) * 0.4}s` }}>
            <circle cx={x} cy={y + 9} r="14" fill={BULBS[i % BULBS.length]} opacity="0.25" />
            <ellipse cx={x} cy={y + 9} rx="5" ry="7" fill={BULBS[i % BULBS.length]} />
          </g>
        );
      })}

      {/* curtains */}
      <g>
        <path d="M0 0 H230 C210 120 250 240 190 330 C170 380 200 470 160 600 H0 Z" fill="url(#cs-curtain)" />
        <path d="M60 0 C70 160 40 360 70 600 M130 0 C150 160 120 340 120 600" stroke="#9c86e6" strokeWidth="4" fill="none" opacity="0.55" />
        <path d="M150 300 q40 20 70 6" stroke="#ff9ecf" strokeWidth="10" strokeLinecap="round" fill="none" />
        <circle cx="222" cy="304" r="9" fill="#ff7fbf" />
      </g>
      <g>
        <path d="M1200 0 H970 C990 120 950 240 1010 330 C1030 380 1000 470 1040 600 H1200 Z" fill="url(#cs-curtain)" />
        <path d="M1140 0 C1130 160 1160 360 1130 600 M1070 0 C1050 160 1080 340 1080 600" stroke="#9c86e6" strokeWidth="4" fill="none" opacity="0.55" />
        <path d="M1050 300 q-40 20 -70 6" stroke="#ff9ecf" strokeWidth="10" strokeLinecap="round" fill="none" />
        <circle cx="978" cy="304" r="9" fill="#ff7fbf" />
      </g>

      {/* bed: blanket and pillows */}
      <path d="M0 520 C160 470 300 500 450 488 C620 474 760 508 900 490 C1040 474 1120 500 1200 492 V600 H0 Z" fill="#efe6ff" />
      <g fill="#d8c9ff" opacity="0.7">
        {Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx={30 + i * 55} cy={540 + (i % 2) * 22} r="5" />
        ))}
      </g>
      <rect x="40" y="440" width="230" height="110" rx="50" fill="#ffd6ec" transform="rotate(-6 155 495)" />
      <rect x="250" y="462" width="190" height="90" rx="42" fill="#d6f2ff" transform="rotate(5 345 507)" />

      {/* plush: NEAR-green dino */}
      <g transform="translate(470 420)">
        <path d="M10 110 C0 60 30 30 70 36 C110 40 130 80 120 110 Z" fill="#7ff0c4" />
        <path d="M40 36 l8 -14 l8 14 M64 34 l8 -14 l8 14 M88 42 l9 -12 l5 15" fill="#4fd6a4" />
        <circle cx="58" cy="66" r="5" fill="#2b2350" />
        <circle cx="86" cy="66" r="5" fill="#2b2350" />
        <ellipse cx="50" cy="80" rx="7" ry="4" fill="#ffadc9" />
        <ellipse cx="96" cy="80" rx="7" ry="4" fill="#ffadc9" />
        <path d="M66 82 q6 6 12 0" stroke="#2b2350" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M120 96 q30 -4 34 -26 q-14 18 -36 14 Z" fill="#7ff0c4" />
      </g>
      {/* plush: star */}
      <path
        d="M720 470 l14 28 l31 4 l-23 21 l6 31 l-28 -15 l-28 15 l6 -31 l-23 -21 l31 -4 Z"
        fill="#ffe27a"
        stroke="#f2c94c"
        strokeWidth="3"
        strokeLinejoin="round"
        transform="rotate(-10 734 512)"
      />
      <circle cx="725" cy="508" r="3" fill="#2b2350" />
      <circle cx="743" cy="508" r="3" fill="#2b2350" />
    </svg>
  );
}
