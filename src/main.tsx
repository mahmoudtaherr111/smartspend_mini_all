import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

window.onerror = function(msg, url, line, col, error) {
  const div = document.createElement('div');
  div.style.color = 'red';
  div.style.padding = '20px';
  div.style.background = 'white';
  div.style.position = 'fixed';
  div.style.top = '0';
  div.style.zIndex = '9999';
  div.innerHTML = `<h1>Runtime Error</h1><p>${msg}</p><p>at ${url}:${line}:${col}</p><pre>${error?.stack || ''}</pre>`;
  document.body.appendChild(div);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
