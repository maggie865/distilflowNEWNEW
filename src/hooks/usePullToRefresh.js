import { useEffect, useRef, useState } from 'react';

export const usePullToRefresh = (onRefresh, containerSelector = '.scrollable-container') => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);

  useEffect(() => {
    const container = document.querySelector(containerSelector) || window;
    let touchStartY = 0;

    const handleTouchStart = (e) => {
      const scrollTop = container === window ? window.pageYOffset : container.scrollTop;
      if (scrollTop === 0) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      const scrollTop = container === window ? window.pageYOffset : container.scrollTop;
      if (scrollTop === 0 && touchStartY > 0) {
        const pullDistance = e.touches[0].clientY - touchStartY;
        if (pullDistance > 60 && !isRefreshing) {
          setIsRefreshing(true);
        }
      }
    };

    const handleTouchEnd = async () => {
      if (isRefreshing) {
        await onRefresh();
        setIsRefreshing(false);
      }
      touchStartY = 0;
    };

    container.addEventListener('touchstart', handleTouchStart, false);
    container.addEventListener('touchmove', handleTouchMove, false);
    container.addEventListener('touchend', handleTouchEnd, false);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isRefreshing, onRefresh, containerSelector]);

  return isRefreshing;
};