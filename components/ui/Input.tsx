import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input 
      className={`w-full bg-white border border-light-6 rounded-sm px-3 py-2 text-black focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue transition-colors ${className}`}
      {...props}
    />
  );
}
