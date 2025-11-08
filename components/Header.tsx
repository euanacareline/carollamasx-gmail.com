
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-slate-900/50 backdrop-blur-sm shadow-lg shadow-cyan-500/10 border-b border-slate-700">
      <div className="container mx-auto px-4 py-5 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
          Gerador de Cenas Bíblicas
        </h1>
        <p className="text-gray-400 mt-2 text-sm md:text-base">
          Transforme capítulos da Bíblia em arte no estilo Pixar
        </p>
      </div>
    </header>
  );
};

export default Header;
