import React from 'react';

export const ZX_LOGO_SRC = '/assets/aistudio/file_000000009fec82119d274e8a32187558_3842952e.png';

export function ZxLogo({
  size = 36,
  showWordmark = false,
  className = '',
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <div
        style={{ width: size, height: size }}
        className="rounded-xl overflow-hidden bg-[#080810] ring-1 ring-white/15 shrink-0 flex items-center justify-center"
      >
        <img
          src={ZX_LOGO_SRC}
          alt="ZX Logo"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
      {showWordmark && (
        <span className="font-display text-xl font-bold tracking-tight whitespace-nowrap text-[#080810] dark:text-white">
          ZX
        </span>
      )}
    </div>
  );
}
