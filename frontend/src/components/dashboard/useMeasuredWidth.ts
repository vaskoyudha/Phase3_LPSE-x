import { useEffect, useRef, useState } from 'react';

export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setWidth(Math.max(1, Math.floor(element.getBoundingClientRect().width)));
      });
    };

    measure();

    const ResizeObserverCtor = window.ResizeObserver;
    if (typeof ResizeObserverCtor === 'function') {
      const observer = new ResizeObserverCtor(measure);
      observer.observe(element);
      return () => {
        window.cancelAnimationFrame(frame);
        observer.disconnect();
      };
    }

    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return [ref, width] as const;
}
