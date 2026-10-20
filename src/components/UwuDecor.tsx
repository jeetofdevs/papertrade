import { useEffect } from 'react';
import { useSettings } from '../lib/settings';

// Theme switch plus the decorations for UWU mode. All art is drawn here as SVG.
export function UwuDecor() {
  const { uwu, uwuless } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('uwu', uwu);
    root.classList.toggle('uwuless', uwuless);
  }, [uwu, uwuless]);

  if (!uwu) return null;
  return (
    <div className="uwu-decor" aria-hidden="true">
      <div className="uwu-stars" />
      <Cloud className="uwu-cloud uwu-cloud-1" />
      <Cloud className="uwu-cloud uwu-cloud-2" />
      <Cat />
    </div>
  );
}

function Cloud({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 70">
      <g fill="#fff">
        <circle cx="35" cy="40" r="22" />
        <circle cx="60" cy="30" r="26" />
        <circle cx="86" cy="40" r="20" />
        <rect x="30" y="40" width="62" height="22" rx="11" />
      </g>
    </svg>
  );
}

export function Cat() {
  return (
    <svg className="uwu-cat" viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      {/* tail */}
      <path d="M150 168 C 190 160, 192 110, 168 100 C 160 97, 156 106, 164 110 C 178 118, 172 150, 146 154 Z" fill="#cdb8ff" />
      {/* body */}
      <ellipse cx="100" cy="160" rx="56" ry="36" fill="#e9dcff" />
      <ellipse cx="100" cy="166" rx="30" ry="20" fill="#fff" />
      {/* paws */}
      <ellipse cx="74" cy="190" rx="14" ry="8" fill="#fff" />
      <ellipse cx="126" cy="190" rx="14" ry="8" fill="#fff" />
      {/* head */}
      <path d="M46 62 L58 18 L86 46 Z" fill="#e9dcff" />
      <path d="M154 62 L142 18 L114 46 Z" fill="#e9dcff" />
      <path d="M56 54 L61 30 L77 46 Z" fill="#ffb3d6" />
      <path d="M144 54 L139 30 L123 46 Z" fill="#ffb3d6" />
      <ellipse cx="100" cy="86" rx="62" ry="50" fill="#e9dcff" />
      {/* eyes */}
      <g className="uwu-eyes">
        <ellipse cx="76" cy="84" rx="9" ry="11" fill="#3b2e5a" />
        <ellipse cx="124" cy="84" rx="9" ry="11" fill="#3b2e5a" />
        <circle cx="79" cy="80" r="3.5" fill="#fff" />
        <circle cx="127" cy="80" r="3.5" fill="#fff" />
      </g>
      {/* blush */}
      <ellipse cx="62" cy="102" rx="10" ry="6" fill="#ffb3d6" opacity="0.8" />
      <ellipse cx="138" cy="102" rx="10" ry="6" fill="#ffb3d6" opacity="0.8" />
      {/* nose and w mouth */}
      <path d="M96 96 L104 96 L100 101 Z" fill="#ff8fc7" />
      <path d="M88 104 Q94 112 100 104 Q106 112 112 104" fill="none" stroke="#3b2e5a" strokeWidth="2.5" strokeLinecap="round" />
      {/* whiskers */}
      <g stroke="#bfa9ef" strokeWidth="2" strokeLinecap="round">
        <path d="M44 92 L24 88" />
        <path d="M44 100 L24 102" />
        <path d="M156 92 L176 88" />
        <path d="M156 100 L176 102" />
      </g>
      {/* bow */}
      <g transform="translate(132 40) rotate(18)">
        <path d="M0 0 L-16 -10 L-16 10 Z" fill="#ff8fc7" />
        <path d="M0 0 L16 -10 L16 10 Z" fill="#ff8fc7" />
        <circle r="5" fill="#ff6fb5" />
      </g>
    </svg>
  );
}
