import { useEffect, useState } from 'react';

type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' };
let push: (t: Omit<Toast, 'id'>) => void = () => {};

export const toast = {
  ok: (text: string) => push({ text, kind: 'ok' }),
  err: (text: string) => push({ text, kind: 'err' }),
  info: (text: string) => push({ text, kind: 'info' }),
};

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    push = (t) => {
      const id = ++n;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
    };
  }, []);
  return (
    <div className="toasts" role="status">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
