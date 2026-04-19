import React from 'react';

export function Badge({ className = '', children, variant = 'info' }: { className?: string, children: React.ReactNode, variant?: 'info' | 'success' | 'warning' | 'danger' | 'purple' }) {
  const variants = {
    info: 'bg-light-blue text-light-blue-dark border border-light-blue',
    success: 'bg-lime-green text-green-dark border border-lime-green',
    warning: 'bg-light-yellow text-light-yellow-dark border border-light-yellow',
    danger: 'bg-pink text-pink-dark border border-pink',
    purple: 'bg-light-purple text-purple-2-dark border border-light-purple',
  };
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
