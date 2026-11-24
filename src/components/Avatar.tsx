import React from 'react';
import { BadgeCheck } from 'lucide-react';

export function Avatar({
  src,
  name,
  size = 40,
  online = false,
  className = '',
}: {
  src?: string;
  name: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const initial = (name || 'Z').trim().charAt(0).toUpperCase();
  return (
    <div style={{ width: size, height: size }} className={`relative shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full rounded-full object-cover bg-[#101020] ring-1 ring-black/10 dark:ring-white/15"
        />
      ) : (
        <div className="w-full h-full rounded-full zx-gradient-bg flex items-center justify-center text-white font-display font-bold text-sm">
          {initial}
        </div>
      )}
      {online && (
        <span
          aria-label="Online"
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#080810]"
        />
      )}
    </div>
  );
}

export function VerifiedBadge({ verified }: { verified?: number | boolean }) {
  if (!verified) return null;
  return <BadgeCheck className="w-4 h-4 text-[#792BFF] dark:text-[#FF28B9] shrink-0 inline-block" />;
}
