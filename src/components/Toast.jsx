import { useEffect, useState } from 'react';

export default function Toast({ toast }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    setCurrent(toast);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const cls = 'toast' + (visible ? ' show' : '') + (current && current.type ? ' ' + current.type : '');
  return <div className={cls}>{current ? current.msg : ''}</div>;
}
