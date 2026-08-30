'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

interface UserAvatarProps {
  name?: string | null;
  src?: string | null;
  className?: string;
  size?: number;
  style?: CSSProperties;
  objectPosition?: CSSProperties['objectPosition'];
}

function getInitial(name?: string | null): string {
  return name?.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() || '?';
}

export default function UserAvatar({ name, src, className, size = 32, style, objectPosition = 'center top' }: UserAvatarProps) {
  const cleanSrc = (src || '').trim();
  const [failedSrc, setFailedSrc] = useState('');
  const showImage = cleanSrc && cleanSrc !== failedSrc;

  useEffect(() => {
    if (cleanSrc && cleanSrc !== failedSrc) return;
    if (!cleanSrc) setFailedSrc('');
  }, [cleanSrc, failedSrc]);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {showImage ? (
        <img
          src={cleanSrc}
          alt={name ? `Ảnh đại diện ${name}` : 'Ảnh đại diện'}
          onError={() => setFailedSrc(cleanSrc)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition, display: 'block' }}
        />
      ) : (
        getInitial(name)
      )}
    </div>
  );
}
