import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Importăm paginile noastre
import AuthPage from './AuthPage';
import Dashboard from './Dashboard';
import CodeArena from './CodeArena';

function App() {
  return (
    <Router>
      <Routes>
        {/* Pagina de Login */}
        <Route path="/" element={<AuthPage />} />

        {/* Pagina cu lista de probleme */}
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* Pagina cu editorul pentru problema selectată */}
        <Route path="/codearena/:problemId" element={<CodeArena />} />

        {/* Fallback pentru link-uri greșite */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;