import React from 'react';
import ReactDOM from 'react-dom/client';
// Bundled locally (full axis set) so typography works offline and supports width/grade/opsz.
import '@fontsource-variable/roboto-flex/full.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
