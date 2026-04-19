import React from 'react';

export function Card({ className = '', children }: { className?: string, children: React.ReactNode }) {
  return (
    <div className={`bg-light-1 rounded-lg border border-light-5 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children }: { className?: string, children: React.ReactNode }) {
  return <div className={`px-6 py-4 border-b border-light-5 bg-white ${className}`}>{children}</div>;
}

export function CardTitle({ className = '', children }: { className?: string, children: React.ReactNode }) {
  return <h3 className={`text-lg font-bold font-sans ${className}`}>{children}</h3>;
}

export function CardContent({ className = '', children }: { className?: string, children: React.ReactNode }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
