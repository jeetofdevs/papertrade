// Batman, the Nitro mascot: a chubby tricolor corgi. Original cartoon art drawn in SVG,
// animated with CSS (breathing, blinking, ear twitches, tail wags) and reacting to the trader's mood.

import { useId } from 'react';

export type Mood = 'happy' | 'sad' | 'sleepy' | 'neutral';

const TAN = '#D9884A';
const TAN_DARK = '#B5652C';
const BLACK = '#2A2422';
const WHITE = '#FCF8F3';
const CREAM = '#EADDCF';
const PINK = '#F3A6A0';
const INK = '#1C1614';

const STYLE = `
.bm-tail{transform-origin:208px 228px;animation:bm-wag .5s ease-in-out infinite alternate}
.bm-body{transform-origin:150px 292px;animation:bm-breathe 3.2s ease-in-out infinite}
.bm-head{transform-origin:150px 180px;animation:bm-tilt 7s ease-in-out infinite}
.bm-eyes{transform-origin:150px 112px;animation:bm-blink 4.6s infinite}
.bm-earL{transform-origin:104px 84px;animation:bm-twL 5.3s infinite}
.bm-earR{transform-origin:196px 84px;animation:bm-twR 6.7s infinite}
.bm-z{animation:bm-z 3s ease-in-out infinite;opacity:0}
.bm-z2{animation-delay:1s}.bm-z3{animation-delay:2s}
.bm-tear{animation:bm-tear 2.2s ease-in infinite}
.bm-happy .bm-tail{animation-duration:.18s}
.bm-happy .bm-body{animation:bm-bounce .7s ease-in-out infinite}
.bm-sad .bm-tail{animation:none;transform:rotate(30deg)}
.bm-sad .bm-head{animation:none;transform:rotate(-4deg) translateY(4px)}
.bm-sleepy .bm-tail{animation-duration:2.4s}
.bm-sleepy .bm-body{animation-duration:5s}
.bm-sleepy .bm-head{animation:bm-nod 5s ease-in-out infinite}
@keyframes bm-wag{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}
@keyframes bm-breathe{50%{transform:scale(1.025,.985)}}
@keyframes bm-bounce{50%{transform:translateY(-6px) scale(1.01,.99)}}
@keyframes bm-tilt{0%,70%,100%{transform:rotate(0)}78%{transform:rotate(-7deg)}88%{transform:rotate(3deg)}}
@keyframes bm-nod{0%,100%{transform:rotate(0) translateY(0)}50%{transform:rotate(-3deg) translateY(6px)}}
@keyframes bm-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
@keyframes bm-twL{0%,84%,100%{transform:rotate(0)}88%{transform:rotate(-12deg)}93%{transform:rotate(5deg)}}
@keyframes bm-twR{0%,78%,100%{transform:rotate(0)}83%{transform:rotate(12deg)}88%{transform:rotate(-5deg)}}
@keyframes bm-z{0%{opacity:0;transform:translate(0,0)}30%{opacity:1}100%{opacity:0;transform:translate(14px,-30px)}}
@keyframes bm-tear{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(26px);opacity:0}}
@media (prefers-reduced-motion:reduce){.bm-root *{animation:none!important}}
`;

const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${300 - Number(x)} ${y}`);
const EAR = 'M84 94 C 72 68 68 40 76 16 C 100 28 120 46 132 68 Z';
const EAR_IN = 'M92 84 C 84 64 82 46 85 30 C 101 41 113 54 121 68 Z';

export function Batman({ mood = 'neutral', className = 'batman' }: { mood?: Mood; className?: string }) {
  const id = useId().replace(/[^a-z0-9]/gi, '');
  const clip = `bm-body-${id}`;
  const sad = mood === 'sad';

  const eyes =
    mood === 'happy' ? (
      <g stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M109 115 Q120 102 131 115" />
        <path d="M169 115 Q180 102 191 115" />
      </g>
    ) : mood === 'sleepy' ? (
      <g stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none">
        <path d="M109 112 Q120 121 131 112" />
        <path d="M169 112 Q180 121 191 112" />
      </g>
    ) : (
      <g className="bm-eyes">
        {[120, 180].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy={sad ? 115 : 112} rx="10" ry={sad ? 11 : 12} fill="#2B1A12" />
            <circle cx={x - 3} cy={sad ? 110 : 107} r="3.6" fill="#fff" />
            <circle cx={x + 4} cy={sad ? 119 : 116} r="1.6" fill="#fff" opacity=".8" />
          </g>
        ))}
      </g>
    );

  const mouth =
    mood === 'happy' ? (
      <g>
        <path d="M132 146 Q150 176 168 146 Q150 154 132 146 Z" fill="#6E2B2B" />
        <path d="M141 156 Q150 176 159 156 Q150 159 141 156 Z" fill="#FF8FA3" />
      </g>
    ) : sad ? (
      <path d="M137 158 Q150 148 163 158" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    ) : mood === 'sleepy' ? (
      <path d="M144 151 Q150 155 156 151" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M150 141 V147 M150 147 Q142 155 134 149 M150 147 Q158 155 166 149" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
    );

  return (
    <svg className={`${className} bm-root bm-${mood}`} viewBox="0 0 300 300" width="300" height="300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <style>{STYLE}</style>
      <defs>
        <clipPath id={clip}>
          <path d="M54 292 C 34 236 58 180 110 166 L 190 166 C 242 180 266 236 246 292 Z" />
        </clipPath>
      </defs>

      <ellipse cx="150" cy="293" rx="108" ry="7" fill="#000" opacity=".22" />

      {/* Fluffy tail, behind the body */}
      <g className="bm-tail">
        <path d="M204 238 C 214 214 230 196 244 180 C 246 168 254 158 262 152 C 260 162 266 160 272 156 C 270 168 276 170 280 168 C 274 182 280 190 276 200 C 270 218 252 234 230 242 C 220 246 210 246 204 238 Z" fill={TAN} />
        <path d="M244 180 C 246 168 254 158 262 152 C 260 162 266 160 272 156 C 270 168 276 170 280 168 C 274 182 272 190 262 198 C 256 190 250 186 244 180 Z" fill={BLACK} opacity=".9" />
      </g>

      {/* Body: tan base, black saddle, white chest */}
      <g className="bm-body">
        <path d="M54 292 C 34 236 58 180 110 166 L 190 166 C 242 180 266 236 246 292 Z" fill={TAN} />
        <g clipPath={`url(#${clip})`}>
          <ellipse cx="44" cy="208" rx="44" ry="66" fill={BLACK} />
          <ellipse cx="256" cy="208" rx="44" ry="66" fill={BLACK} />
          <ellipse cx="150" cy="238" rx="70" ry="70" fill={WHITE} />
          <ellipse cx="150" cy="262" rx="50" ry="34" fill={CREAM} opacity=".45" />
        </g>
        {/* Short front legs */}
        {[112, 160].map((x) => (
          <g key={x}>
            <rect x={x} y="246" width="28" height="44" rx="14" fill={WHITE} stroke={CREAM} strokeWidth="2" />
            <path d={`M${x + 9} 282 v7 M${x + 19} 282 v7`} stroke={CREAM} strokeWidth="2" strokeLinecap="round" />
          </g>
        ))}
        {/* Fluffy neck ruff */}
        <path d="M92 176 Q100 192 112 184 Q120 200 134 190 Q142 204 150 192 Q158 204 166 190 Q180 200 188 184 Q200 192 208 176 Z" fill={WHITE} />
        {/* Collar with name tag */}
        <path d="M100 176 Q150 198 200 176" stroke="#4E5968" strokeWidth="9" fill="none" strokeLinecap="round" />
        <circle cx="150" cy="199" r="10" fill="#FFC93C" stroke="#C9971A" strokeWidth="2" />
        <text x="150" y="203.5" textAnchor="middle" fontSize="12" fontWeight="900" fontFamily="Inter, sans-serif" fill="#7A5600">
          B
        </text>
      </g>

      {/* Head */}
      <g className="bm-head">
        <g className="bm-earL">
          <g transform={sad ? 'rotate(-32 104 84)' : undefined}>
            <path d={EAR} fill={TAN} stroke={TAN_DARK} strokeWidth="3" strokeLinejoin="round" />
            <path d={EAR_IN} fill={PINK} />
          </g>
        </g>
        <g className="bm-earR">
          <g transform={sad ? 'rotate(32 196 84)' : undefined}>
            <path d={mirror(EAR)} fill={TAN} stroke={TAN_DARK} strokeWidth="3" strokeLinejoin="round" />
            <path d={mirror(EAR_IN)} fill={PINK} />
          </g>
        </g>

        <ellipse cx="150" cy="116" rx="77" ry="64" fill={TAN} />
        <path d="M86 92 C 96 70 118 56 150 54 C 182 56 204 70 214 92 C 196 80 176 74 150 74 C 124 74 104 80 86 92 Z" fill={TAN_DARK} opacity=".35" />
        {/* Fluffy white cheeks, blaze and muzzle */}
        <ellipse cx="110" cy="152" rx="36" ry="25" fill={WHITE} />
        <ellipse cx="190" cy="152" rx="36" ry="25" fill={WHITE} />
        <path d="M150 58 C 141 76 137 98 135 124 L 165 124 C 163 98 159 76 150 58 Z" fill={WHITE} />
        <ellipse cx="150" cy="146" rx="40" ry="27" fill={WHITE} />

        {/* Tricolor eyebrow spots */}
        <ellipse cx="118" cy="94" rx="8" ry="4.6" fill="#F3C892" transform={sad ? 'rotate(18 118 94)' : undefined} />
        <ellipse cx="182" cy="94" rx="8" ry="4.6" fill="#F3C892" transform={sad ? 'rotate(-18 182 94)' : undefined} />

        {eyes}
        <ellipse cx="102" cy="134" rx="11" ry="6" fill="#FF8FA3" opacity=".45" />
        <ellipse cx="198" cy="134" rx="11" ry="6" fill="#FF8FA3" opacity=".45" />

        <ellipse cx="150" cy="133" rx="13" ry="9" fill={INK} />
        <ellipse cx="146" cy="130" rx="4.5" ry="2.2" fill="#fff" opacity=".55" />
        {mouth}

        {sad && <path className="bm-tear" d="M131 126 Q126 136 131 140 Q136 136 131 126 Z" fill="#8FD3FF" />}
      </g>

      {mood === 'sleepy' && (
        <g fill="#C9B8FF" fontFamily="Inter, sans-serif" fontWeight="900">
          <text className="bm-z" x="214" y="70" fontSize="18">z</text>
          <text className="bm-z bm-z2" x="226" y="56" fontSize="22">z</text>
          <text className="bm-z bm-z3" x="240" y="40" fontSize="26">Z</text>
        </g>
      )}
    </svg>
  );
}
