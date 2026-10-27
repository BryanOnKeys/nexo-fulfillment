import { createRoot } from 'react-dom/client';
import { SessionProvider } from './state';
import { App } from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <SessionProvider>
    <App />
  </SessionProvider>,
);
