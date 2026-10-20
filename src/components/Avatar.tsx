import { avatarColors } from '../lib/profile';

export function Avatar({ id, size = 32 }: { id: string; size?: number }) {
  const [a, b] = avatarColors(id);
  const letter = id.replace(/[^a-z0-9]/gi, '')[0]?.toUpperCase() ?? '?';
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.44, background: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
