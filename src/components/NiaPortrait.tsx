// Nia in full anime proportions (not chibi). Original artwork, drawn in SVG.
// A custom illustration can replace her: set VITE_NIA_IMAGE to an image URL (for example /nia.png in /public).

import { useId } from 'react';
import type { Mood } from './Waifu';

export const NIA_IMAGE = (import.meta.env?.VITE_NIA_IMAGE as string | undefined) || "";

export function NiaPortrait({ mood = 'neutral', className = 'nia-portrait' }: { mood?: Mood; className?: string }) {
  const id = useId().replace(/[^a-z0-9]/gi, '');
  if (NIA_IMAGE) return <img className={className} src={NIA_IMAGE} alt="" />;
  const g = (n: string) => `${n}-${id}`;
  const closed = mood === 'happy' || mood === 'sleepy';

  return (
    <svg className={className} viewBox="0 0 300 380" width="300" height="380" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={g('hair')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc2e0" />
          <stop offset="0.55" stopColor="#f59ccd" />
          <stop offset="1" stopColor="#c9a3f0" />
        </linearGradient>
        <linearGradient id={g('hairShade')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d77fb6" />
          <stop offset="1" stopColor="#f2a2cf" />
        </linearGradient>
        <linearGradient id={g('skin')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1e9" />
          <stop offset="1" stopColor="#ffe1d4" />
        </linearGradient>
        <linearGradient id={g('iris')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1f6e" />
          <stop offset="0.55" stopColor="#7d55d6" />
          <stop offset="1" stopColor="#f29ad0" />
        </linearGradient>
        <linearGradient id={g('hoodie')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c2540" />
          <stop offset="1" stopColor="#17131f" />
        </linearGradient>
      </defs>

      {/* long hair behind */}
      <path
        d="M92 110 C78 170 76 250 66 320 C60 352 70 376 86 380 L214 380 C230 376 240 352 234 320 C224 250 222 170 208 110 C198 70 180 52 150 52 C120 52 102 70 92 110 Z"
        fill={`url(#${g('hair')})`}
      />
      <g stroke="#e58cc2" strokeWidth="2" fill="none" opacity="0.7" strokeLinecap="round">
        <path d="M80 190 C72 250 70 300 74 360" />
        <path d="M96 210 C90 270 92 320 98 370" />
        <path d="M220 190 C228 250 230 300 226 360" />
        <path d="M204 210 C210 270 208 320 202 370" />
      </g>

      {/* neck and shoulders */}
      <path d="M136 186 H164 V222 C156 230 144 230 136 222 Z" fill="#f6d2c4" />
      <path d="M60 380 C64 300 96 258 150 252 C204 258 236 300 240 380 Z" fill={`url(#${g('skin')})`} />
      {/* top straps and hoodie */}
      <path d="M118 256 L112 300 M182 256 L188 300" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M112 300 C130 312 170 312 188 300 L196 380 H104 Z" fill="#f4f1ff" />
      <path d="M58 380 C60 320 78 282 110 266 L118 380 Z" fill={`url(#${g('hoodie')})`} />
      <path d="M242 380 C240 320 222 282 190 266 L182 380 Z" fill={`url(#${g('hoodie')})`} />
      <path d="M110 266 L116 380 M190 266 L184 380" stroke="#4a4166" strokeWidth="2.5" />
      <path d="M118 300 v80 M182 300 v80" stroke="#9a92b8" strokeWidth="2" strokeDasharray="4 4" />
      {/* N badge */}
      <g transform="translate(200 318)">
        <rect width="20" height="20" rx="5" fill="#0b1210" />
        <path d="M4.5 3.5 L8 5 L8 17 L4.5 15.5 Z" fill="#f4f1e8" />
        <path d="M4.5 3.5 L8 5 L16 16.5 L12.5 15 Z" fill="#00ec97" />
        <path d="M12.5 3.5 L16 5 L16 16.5 L12.5 15 Z" fill="#c9c4b5" />
      </g>

      {/* face */}
      <path d="M106 118 C106 78 128 58 150 58 C172 58 194 78 194 118 C194 156 176 186 150 194 C124 186 106 156 106 118 Z" fill={`url(#${g('skin')})`} />
      {/* shade under bangs */}
      <path d="M108 104 C130 116 170 116 192 104 L192 116 C170 126 130 126 108 116 Z" fill="#f7cfc2" opacity="0.6" />

      {/* eyes */}
      {closed ? (
        <g stroke="#3b2552" strokeWidth="3.2" fill="none" strokeLinecap="round">
          {mood === 'happy' ? (
            <>
              <path d="M118 132 Q130 120 142 132" />
              <path d="M158 132 Q170 120 182 132" />
            </>
          ) : (
            <>
              <path d="M118 130 Q130 137 142 130" />
              <path d="M158 130 Q170 137 182 130" />
            </>
          )}
        </g>
      ) : (
        <g className="waifu-eyes">
          {[130, 170].map((cx, i) => (
            <g key={cx}>
              <path d={`M${cx - 14} 128 Q${cx} 112 ${cx + 14} 126 Q${cx + 12} 146 ${cx} 147 Q${cx - 12} 146 ${cx - 14} 128 Z`} fill="#fff" />
              <ellipse cx={cx + (i ? -1 : 1)} cy="134" rx="9" ry="12" fill={`url(#${g('iris')})`} />
              <ellipse cx={cx + (i ? -1 : 1)} cy="133" rx="4.2" ry="6" fill="#24113f" />
              <circle cx={cx - 3} cy="128" r="3.6" fill="#fff" />
              <circle cx={cx + 4} cy="139" r="1.7" fill="#fff" opacity="0.9" />
              {/* upper lash line with a flick */}
              <path
                d={`M${cx - 16} 128 Q${cx} 110 ${cx + 15} 124 ${i ? `L${cx + 19} 121` : ''}`}
                fill="none"
                stroke="#2a1640"
                strokeWidth="3.6"
                strokeLinecap="round"
              />
              {!i && <path d={`M${cx - 16} 128 L${cx - 20} 124`} stroke="#2a1640" strokeWidth="3" strokeLinecap="round" />}
              <path d={`M${cx - 9} 147 Q${cx} 150 ${cx + 9} 147`} stroke="#c58aa8" strokeWidth="1.4" fill="none" />
              <path d={`M${cx - 12} 116 Q${cx} 108 ${cx + 12} 114`} stroke="#c89ab4" strokeWidth="1.3" fill="none" opacity="0.8" />
            </g>
          ))}
        </g>
      )}
      {/* brows */}
      <g stroke="#d27aad" strokeWidth="2.4" strokeLinecap="round" fill="none">
        {mood === 'sad' ? (
          <>
            <path d="M118 104 L140 110" />
            <path d="M182 104 L160 110" />
          </>
        ) : (
          <>
            <path d="M118 107 Q129 101 140 105" />
            <path d="M160 105 Q171 101 182 107" />
          </>
        )}
      </g>
      {mood === 'sad' && (
        <g fill="#9edcff" opacity="0.9">
          <path className="waifu-tear" d="M122 148 Q118 158 122 162 Q126 158 122 148 Z" />
          <path className="waifu-tear waifu-tear-2" d="M178 148 Q174 158 178 162 Q182 158 178 148 Z" />
        </g>
      )}
      {/* nose, blush, mouth */}
      <path d="M150 152 l-2 6 h3" stroke="#e3a998" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <ellipse cx="118" cy="157" rx="11" ry="5" fill="#ffa9c6" opacity={mood === 'happy' ? 0.85 : 0.55} />
      <ellipse cx="182" cy="157" rx="11" ry="5" fill="#ffa9c6" opacity={mood === 'happy' ? 0.85 : 0.55} />
      {mood === 'happy' ? (
        <path d="M140 168 Q150 180 160 168 Q150 172 140 168 Z" fill="#ff7aa2" stroke="#3b2552" strokeWidth="1.8" strokeLinejoin="round" />
      ) : mood === 'sad' ? (
        <path d="M142 174 Q150 168 158 174" stroke="#3b2552" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : mood === 'sleepy' ? (
        <ellipse cx="150" cy="171" rx="3" ry="3.6" fill="#ff7aa2" stroke="#3b2552" strokeWidth="1.5" />
      ) : (
        <path d="M143 170 Q150 175 157 170" stroke="#3b2552" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}

      {/* side locks over the face */}
      <path d="M106 96 C96 140 98 190 108 240 C114 210 116 160 120 120 Z" fill={`url(#${g('hair')})`} />
      <path d="M194 96 C204 140 202 190 192 240 C186 210 184 160 180 120 Z" fill={`url(#${g('hair')})`} />
      {/* bangs: pointed strands */}
      <path
        d="M100 108 C98 66 124 44 152 44 C182 44 206 66 202 110 C197 100 191 94 185 91 C187 103 183 113 177 119 C175 105 169 97 161 93 C161 105 157 115 151 121 C149 107 143 99 135 95 C135 107 129 115 121 119 C121 109 117 101 111 99 C106 101 103 104 100 108 Z"
        fill={`url(#${g('hair')})`}
      />
      <path d="M124 56 C140 48 166 48 180 56" stroke="#ffe0f0" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M135 95 C136 104 132 112 127 116 M161 93 C161 103 157 111 153 116 M185 91 C186 100 183 108 179 113" stroke={`url(#${g('hairShade')})`} strokeWidth="1.8" fill="none" opacity="0.7" />
      {/* ahoge */}
      <path className="waifu-ahoge" d="M150 46 C142 24 160 10 172 18 C158 18 154 30 156 44 Z" fill="#ffc2e0" />

      {/* hair clips with ribbons */}
      {[
        [104, 92, -20],
        [196, 92, 20],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <path d="M0 0 L-15 -9 L-13 9 Z" fill="#fff" stroke="#e7d9ff" strokeWidth="1" />
          <path d="M0 0 L15 -9 L13 9 Z" fill="#fff" stroke="#e7d9ff" strokeWidth="1" />
          <path d="M-11 -4 l6 2 M11 -4 l-6 2" stroke="#ff9ecf" strokeWidth="1.6" />
          <circle r="3.6" fill="#ff6fb5" />
        </g>
      ))}

      {mood === 'sleepy' && (
        <g fill="#c79bff" fontFamily="Nunito, sans-serif" fontWeight="900">
          <text className="waifu-z" x="208" y="60" fontSize="24">
            z
          </text>
          <text className="waifu-z waifu-z-2" x="228" y="38" fontSize="16">
            z
          </text>
        </g>
      )}
      {mood === 'happy' && (
        <path className="waifu-heart" d="M66 80 c-6 -8 -18 -2 -12 8 l12 12 l12 -12 c6 -10 -6 -16 -12 -8 Z" fill="#ff8fc7" />
      )}
    </svg>
  );
}
