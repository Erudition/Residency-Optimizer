import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const baseClasses = "inline-flex items-center justify-center font-button font-bold rounded-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";
  
  const sizeClasses = {
    sm: "px-3 py-1 text-sm",
    md: "px-4.5 py-2",
    lg: "px-6 py-3 text-lg"
  };

  const variantClasses = {
    primary: "bg-red text-white border border-red-2-dark shadow-[0_3px_0_var(--tw-shadow-color)] shadow-red-2-dark hover:bg-red-2 active:translate-y-[3px] active:shadow-none",
    secondary: "bg-white text-black border border-light-5 shadow-[0_3px_0_var(--tw-shadow-color)] shadow-light-5 hover:bg-light-2 active:translate-y-[3px] active:shadow-none",
    danger: "bg-white text-red border border-red shadow-[0_3px_0_var(--tw-shadow-color)] shadow-red hover:bg-red/10 active:translate-y-[3px] active:shadow-none",
    ghost: "bg-transparent text-gray-700 hover:bg-light-3"
  };

  return (
    <button 
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
