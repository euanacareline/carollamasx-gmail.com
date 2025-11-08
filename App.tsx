
import React from 'react';
import Header from './components/Header';
import ImageGenerator from './components/ImageGenerator';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-gray-800 text-gray-100 font-sans">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <ImageGenerator />
      </main>
      <footer className="text-center py-4 text-gray-500 text-sm">
        <p>Criado com a API Gemini</p>
      </footer>
    </div>
  );
};

export default App;
