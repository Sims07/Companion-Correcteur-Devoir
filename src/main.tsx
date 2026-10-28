import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { LocalMemoryCompanion } from './ui/LocalMemoryCompanion.tsx';
import { installLocalMemoryFetchBridge } from './adapters/ai/localMemoryFetchBridge.ts';
import './ui/styles.css';

installLocalMemoryFetchBridge();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <LocalMemoryCompanion />
  </React.StrictMode>,
);
