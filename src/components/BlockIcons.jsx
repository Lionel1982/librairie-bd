import React from "react";

// Icône "un tome" : album vu de face avec "BD" marqué dessus
export function IconOneTome({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="1.5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8.5" y1="3" x2="8.5" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <text x="13" y="14.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">BD</text>
    </svg>
  );
}

// Icône "plusieurs tomes" : livres vus de profil (tranches) avec petits numéros
export function IconManyTomes({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="4" height="16" rx="0.8" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.5" y="4" width="4" height="16" rx="0.8" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.3" />
      <rect x="14" y="4" width="4" height="16" rx="0.8" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.3" />
      <text x="5" y="13" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">1</text>
      <text x="10.5" y="13" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">2</text>
      <text x="16" y="13" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">3</text>
    </svg>
  );
}
