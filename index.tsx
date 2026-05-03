import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress Recharts defaultProps warning (known issue with React 18+)
const originalWarn = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('defaultProps will be removed')) {
    return;
  }
  originalWarn(...args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);