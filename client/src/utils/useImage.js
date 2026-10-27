import { useEffect, useState } from 'react';

/** Loads an <img> for use as a Konva.Image source. Returns [image, status]. */
export default function useImage(src) {
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!src) {
      setImage(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const img = new window.Image();
    img.onload = () => {
      setImage(img);
      setStatus('loaded');
    };
    img.onerror = () => {
      setImage(null);
      setStatus('error');
    };
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return [image, status];
}
