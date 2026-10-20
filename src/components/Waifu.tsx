// Nitro's mascot: an original chibi anime girl ("Nia"), drawn as SVG.
// Her face follows your open PnL: happy, sad, sleepy or neutral.

export type Mood = 'happy' | 'sad' | 'sleepy' | 'neutral';

const HAIR = '#ff9ecf';
const HAIR_DARK = '#e57bb3';
const HAIR_LIGHT = '#ffc4e3';
const SKIN = '#ffe6da';
const SKIN_SHADE = '#f7cfc0';
const EYE = '#5b3aa0';
const INK = '#3b2552';

export function Waifu({ mood = 'neutral', className = 'waifu', headOnly = false }: { mood?: Mood; className?: string; headOnly?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 200 240" width="200" height="240" xmlns="http://www.w3.org/2000/svg">
      {/* twin tails behind */}
      <g className="waifu-tail-l">
        <path d="M44 78 C10 96 6 150 22 196 C28 212 44 214 46 198 C38 160 42 120 62 96 Z" fill={HAIR} />
        <path d="M40 104 C26 130 24 162 32 190" fill="none" stroke={HAIR_DARK} strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="waifu-tail-r">
        <path d="M156 78 C190 96 194 150 178 196 C172 212 156 214 154 198 C162 160 158 120 138 96 Z" fill={HAIR} />
        <path d="M160 104 C174 130 176 162 168 190" fill="none" stroke={HAIR_DARK} strokeWidth="3" strokeLinecap="round" />
      </g>

      {!headOnly && (
      <>
      {/* body: oversized hoodie */}
      <path d="M52 236 C52 196 70 176 100 176 C130 176 148 196 148 236 Z" fill="#2f2550" />
      <path d="M78 178 L100 204 L122 178" fill="none" stroke="#4a3d7a" strokeWidth="5" strokeLinecap="round" />
      <path d="M96 204 V226 M104 204 V226" stroke="#e9dcff" strokeWidth="2.5" strokeLinecap="round" />
      {/* little N badge */}
      <g transform="translate(118 206)">
        <rect width="18" height="18" rx="5" fill="#0b1210" />
        <path d="M4 3 L7 4.5 L7 15 L4 13.5 Z" fill="#f4f1e8" />
        <path d="M4 3 L7 4.5 L14 14.5 L11 13 Z" fill="#00ec97" />
        <path d="M11 3 L14 4.5 L14 14.5 L11 13 Z" fill="#c9c4b5" />
      </g>
      {/* neck */}
      <path d="M90 160 H110 V180 C104 184 96 184 90 180 Z" fill={SKIN_SHADE} />
      </>
      )}

      {/* back hair */}
      <path d="M40 92 C40 40 72 18 100 18 C128 18 160 40 160 92 C160 130 150 160 136 170 L64 170 C50 160 40 130 40 92 Z" fill={HAIR} />

      {/* face */}
      <path d="M56 96 C56 64 76 48 100 48 C124 48 144 64 144 96 C144 132 124 160 100 160 C76 160 56 132 56 96 Z" fill={SKIN} />

      {/* side locks */}
      <path d="M54 84 C46 110 48 140 58 160 C62 150 62 130 64 112 Z" fill={HAIR} />
      <path d="M146 84 C154 110 152 140 142 160 C138 150 138 130 136 112 Z" fill={HAIR} />

      {/* bangs */}
      <path
        d="M52 92 C54 52 80 34 104 36 C130 38 150 58 148 94 C140 82 132 74 126 70 C126 80 122 88 116 92 C114 82 110 74 104 70 C100 80 92 88 84 92 C86 82 84 74 80 70 C72 78 62 86 52 92 Z"
        fill={HAIR}
      />
      <path d="M78 46 C90 40 112 40 124 46" fill="none" stroke={HAIR_LIGHT} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      {/* ahoge */}
      <path className="waifu-ahoge" d="M100 37 C96 22 108 14 116 20 C108 20 104 26 104 36 Z" fill={HAIR} />

      {/* bows */}
      <g transform="translate(46 78) rotate(-18)">
        <path d="M0 0 L-16 -10 L-14 10 Z" fill="#fff" />
        <path d="M0 0 L16 -10 L14 10 Z" fill="#fff" />
        <circle r="4.5" fill="#ff6fb5" />
      </g>
      <g transform="translate(154 78) rotate(18)">
        <path d="M0 0 L-16 -10 L-14 10 Z" fill="#fff" />
        <path d="M0 0 L16 -10 L14 10 Z" fill="#fff" />
        <circle r="4.5" fill="#ff6fb5" />
      </g>

      {/* eyes */}
      {mood === 'happy' && (
        <g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round">
          <path d="M70 108 Q80 96 90 108" />
          <path d="M110 108 Q120 96 130 108" />
        </g>
      )}
      {mood === 'sleepy' && (
        <g stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round">
          <path d="M70 106 Q80 112 90 106" />
          <path d="M110 106 Q120 112 130 106" />
        </g>
      )}
      {(mood === 'neutral' || mood === 'sad') && (
        <g className="waifu-eyes">
          {[80, 120].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="106" rx="10.5" ry="13" fill="#fff" />
              <ellipse cx={cx} cy="107" rx="9" ry="12" fill={EYE} />
              <ellipse cx={cx} cy="111" rx="6" ry="7" fill="#8a63d2" />
              <ellipse cx={cx} cy="108" rx="4" ry="5" fill="#2a1645" />
              <circle cx={cx - 3.5} cy="101" r="3.4" fill="#fff" />
              <circle cx={cx + 3.5} cy="113" r="1.6" fill="#fff" />
              <path d={`M${cx - 11} ${mood === 'sad' ? 96 : 94} Q${cx} ${mood === 'sad' ? 90 : 88} ${cx + 11} ${mood === 'sad' ? 94 : 94}`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
            </g>
          ))}
        </g>
      )}
      {/* brows */}
      {mood === 'sad' ? (
        <g stroke={HAIR_DARK} strokeWidth="2.5" strokeLinecap="round">
          <path d="M72 84 L88 88" />
          <path d="M128 84 L112 88" />
        </g>
      ) : (
        <g stroke={HAIR_DARK} strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M72 86 Q80 82 88 85" />
          <path d="M112 85 Q120 82 128 86" />
        </g>
      )}
      {mood === 'sad' && (
        <g fill="#8fd3ff">
          <path className="waifu-tear" d="M72 118 Q68 128 72 132 Q76 128 72 118 Z" />
          <path className="waifu-tear waifu-tear-2" d="M128 118 Q124 128 128 132 Q132 128 128 118 Z" />
        </g>
      )}

      {/* blush */}
      <ellipse cx="68" cy="126" rx="9" ry="5" fill="#ffadc9" opacity={mood === 'happy' ? 0.95 : 0.7} />
      <ellipse cx="132" cy="126" rx="9" ry="5" fill="#ffadc9" opacity={mood === 'happy' ? 0.95 : 0.7} />
      <g stroke="#ff8fb8" strokeWidth="1.4" strokeLinecap="round" opacity="0.8">
        <path d="M63 124 L61 128 M68 124 L66 128 M73 124 L71 128" />
        <path d="M127 124 L125 128 M132 124 L130 128 M137 124 L135 128" />
      </g>

      {/* mouth */}
      {mood === 'happy' ? (
        <path d="M91 132 Q100 146 109 132 Z" fill="#ff6f9a" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      ) : mood === 'sad' ? (
        <path d="M93 140 Q100 133 107 140" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      ) : mood === 'sleepy' ? (
        <ellipse cx="100" cy="137" rx="3.5" ry="4" fill="#ff6f9a" stroke={INK} strokeWidth="1.8" />
      ) : (
        <path d="M93 134 Q96.5 139 100 134 Q103.5 139 107 134" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      )}

      {/* extras */}
      {mood === 'sleepy' && (
        <g fill="#c79bff" fontFamily="Nunito, sans-serif" fontWeight="900">
          <text className="waifu-z" x="150" y="42" fontSize="22">
            z
          </text>
          <text className="waifu-z waifu-z-2" x="168" y="24" fontSize="15">
            z
          </text>
        </g>
      )}
      {mood === 'happy' && (
        <g fill="#ff8fc7">
          <path className="waifu-heart" d="M30 52 c-6 -8 -18 -2 -12 8 l12 12 l12 -12 c6 -10 -6 -16 -12 -8 Z" />
          <path className="waifu-heart waifu-heart-2" d="M172 40 c-4 -5 -12 -1 -8 5 l8 8 l8 -8 c4 -6 -4 -10 -8 -5 Z" />
        </g>
      )}
    </svg>
  );
}
