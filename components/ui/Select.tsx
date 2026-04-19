import React from 'react';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = '', children, ...props }: SelectProps) {
  return (
    <select 
      className={`w-full bg-white border border-light-6 rounded-sm px-3 py-2 text-black focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue transition-colors ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
