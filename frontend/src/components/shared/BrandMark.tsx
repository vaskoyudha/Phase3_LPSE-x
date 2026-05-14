import type { CSSProperties } from 'react';
import owlLogo from '../../assets/brand/lpse-x-owl-logo.png';

type BrandMarkProps = {
  size?: number;
  compact?: boolean;
};

export function BrandMark({ size = 52 }: BrandMarkProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    display: 'block',
    objectFit: 'contain',
    flex: '0 0 auto',
  };

  return <img src={owlLogo} alt="LPSE-X emblem" style={style} />;
}
