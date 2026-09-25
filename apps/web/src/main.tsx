import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {configureEngineClient} from '@re-checkers/mobile-ui/engine';
import App from './App.tsx';
import {getEngineClient} from './services/engineClient.ts';
import './index.css';

// The simulator tab renders the real mobile UI, so it needs the same transport
// the rest of this app uses. @re-checkers/mobile-ui ships none of its own by design.
configureEngineClient(getEngineClient());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
