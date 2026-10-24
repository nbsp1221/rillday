import { useEffect, useState } from 'react';

export function useWorkspaceLayout(captureRequest: number) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 899px)');

    const change = () => {
      setNarrow(media.matches);
      setMobileSidebarOpen(false);
    };

    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (!captureRequest) {
      return;
    }
    const frame = requestAnimationFrame(() => document.getElementById('quick-add-input')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [captureRequest]);

  return { narrow, mobileSidebarOpen, setMobileSidebarOpen };
}
