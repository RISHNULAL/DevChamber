import React from 'react';

export interface DevChamberLogoProps {
  size?: number | string;
  className?: string;
  showText?: boolean;
  textSize?: string;
  onClick?: () => void;
  alt?: string;
  style?: React.CSSProperties;
}

export const DevChamberLogo: React.FC<DevChamberLogoProps> = ({
  size = 32,
  className = '',
  showText = false,
  textSize = '18px',
  onClick,
  alt = 'DevChamber',
  style,
}) => {
  const pixelSize = typeof size === 'number' ? `${size}px` : size;

  const logoImage = (
    <img
      src="/brand/devchamber-logo.png"
      alt={alt}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      style={{
        width: pixelSize,
        height: pixelSize,
        objectFit: 'contain',
        borderRadius: '8px',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
      className={`devchamber-logo-img ${className}`}
      loading="eager"
    />
  );

  if (showText) {
    return (
      <div
        className={`devchamber-brand-lockup ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          cursor: onClick ? 'pointer' : 'default',
          textDecoration: 'none',
        }}
        onClick={onClick}
      >
        {logoImage}
        <span
          style={{
            fontFamily: 'Manrope, "DM Sans", sans-serif',
            fontSize: textSize,
            fontWeight: 800,
            letterSpacing: '-0.6px',
            color: '#1a233a',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          DevChamber<span style={{ color: '#4f68d9' }}>.</span>
        </span>
      </div>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label={alt}
      >
        {logoImage}
      </button>
    );
  }

  return logoImage;
};

export default DevChamberLogo;
