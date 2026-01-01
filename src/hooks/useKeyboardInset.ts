import { useEffect, useRef, useState } from 'react';

export const useKeyboardInset = (threshold = 100) => {
  const [keyboardInset, setKeyboardInset] = useState(0);
  const baseViewportHeight = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const visualViewport = window.visualViewport;
    if (!visualViewport) return undefined;

    const getLayoutHeight = () =>
      Math.max(window.innerHeight, document.documentElement.clientHeight);

    if (!baseViewportHeight.current) {
      baseViewportHeight.current = getLayoutHeight();
    }

    const updateInset = () => {
      const vpHeight = visualViewport.height;
      const vpOffsetTop = visualViewport.offsetTop;
      const layoutHeight = baseViewportHeight.current || getLayoutHeight();
      const keyboardHeight = layoutHeight - vpHeight - vpOffsetTop;
      const inset = keyboardHeight > threshold ? Math.max(0, keyboardHeight) : 0;

      if (inset === 0) {
        baseViewportHeight.current = getLayoutHeight();
      }

      setKeyboardInset(inset);
    };

    updateInset();
    visualViewport.addEventListener('resize', updateInset);
    visualViewport.addEventListener('scroll', updateInset);

    return () => {
      visualViewport.removeEventListener('resize', updateInset);
      visualViewport.removeEventListener('scroll', updateInset);
    };
  }, [threshold]);

  return keyboardInset;
};
