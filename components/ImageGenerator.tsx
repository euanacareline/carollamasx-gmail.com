import React, { useState, useCallback, useEffect } from 'react';
import { generateImagePrompt, generateImage, generateSpeech, getVerseText } from '../services/geminiService';
import Spinner from './Spinner';
import { DownloadIcon } from './icons/DownloadIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';


// Helper to write string to DataView
const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

// Converts raw PCM data (from base64) to a WAV Blob that browsers can play
const createWavBlob = (base64: string): Blob => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const pcmData = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        pcmData[i] = binaryString.charCodeAt(i);
    }

    const sampleRate = 24000; // As per Gemini TTS documentation
    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = pcmData.length;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Sub-chunk size
    view.setUint16(20, 1, true); // Audio format (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // Byte rate
    view.setUint16(32, numChannels * (bitsPerSample / 8), true); // Block align
    view.setUint16(34, bitsPerSample, true);

    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write PCM data
    for (let i = 0; i < dataSize; i++) {
        view.setUint8(44 + i, pcmData[i]);
    }

    return new Blob([view], { type: 'audio/wav' });
};


const LANGUAGES = {
    'pt-BR': 'Português',
    'en-US': 'Inglês',
    'es-ES': 'Espanhol',
    'fr-FR': 'Francês',
    'de-DE': 'Alemão',
};

const ImageGenerator: React.FC = () => {
  // --- STATE ---
  const [bibleReference, setBibleReference] = useState('');
  const [characterDescriptions, setCharacterDescriptions] = useState<Record<string, string> | null>(null);
  
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [narratedText, setNarratedText] = useState<string | null>(null);

  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [language, setLanguage] = useState('pt-BR');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isLoading = isImageLoading || isAudioLoading;

  // Bible Reference Parsers
  const parseBibleRef = (ref: string): { book: string; chapter: number; verse: number } | null => {
    const match = ref.trim().match(/^(.*\D)\s*(\d+):(\d+)$/);
    if (!match) return null;
    return {
        book: match[1].trim(),
        chapter: parseInt(match[2], 10),
        verse: parseInt(match[3], 10),
    };
  };

  const formatBibleRef = (parsed: { book: string; chapter: number; verse: number }): string => {
      return `${parsed.book} ${parsed.chapter}:${parsed.verse}`;
  };

  const getNextVerseRef = useCallback(() => {
    const parsed = parseBibleRef(bibleReference);
    return parsed ? formatBibleRef({ ...parsed, verse: parsed.verse + 1 }) : '';
  }, [bibleReference]);


  // Cleanup object URL when component unmounts or URL changes
  useEffect(() => {
    return () => {
        if (generatedAudioUrl) {
            URL.revokeObjectURL(generatedAudioUrl);
        }
    };
  }, [generatedAudioUrl]);

  const handleStartNew = () => {
    setGeneratedImage(null);
    setError(null);
    setBibleReference('');
    setCharacterDescriptions(null);
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
    setGeneratedAudioUrl(null);
    setNarratedText(null);
    setIsImageLoading(false);
    setIsAudioLoading(false);
    setLoadingMessage('');
  };
  
  const handleGenerateImage = useCallback(async () => {
    if (!bibleReference.trim() || isLoading) return;

    setIsImageLoading(true);
    setError(null);
    setGeneratedImage(null);
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
    setGeneratedAudioUrl(null);
    setNarratedText(null);

    try {
        setLoadingMessage('Analisando o versículo...');
        const { scenePrompt, characterDescriptions: newChars } = await generateImagePrompt(bibleReference, characterDescriptions);
        setCharacterDescriptions(newChars);

        setLoadingMessage('Criando a imagem...');
        const imageBase64 = await generateImage(scenePrompt, aspectRatio);
        
        setGeneratedImage(`data:image/jpeg;base64,${imageBase64}`);

    } catch (err: any) {
        console.error(err);
        if (err instanceof Error && err.message.includes('VERSE_NOT_FOUND')) {
             setError("Versículo não encontrado. Verifique a referência ou inicie uma nova cena.");
        } else if (err.toString().includes('500') || err.toString().includes('Rpc failed')) {
            setError('Ocorreu um erro de comunicação com o servidor. Por favor, tente novamente.');
        } else {
            setError((err as Error).message || 'Falha ao gerar a imagem.');
        }
    } finally {
        setIsImageLoading(false);
        setLoadingMessage('');
    }
  }, [bibleReference, aspectRatio, characterDescriptions, isLoading, generatedAudioUrl]);

  const handleGenerateAudio = useCallback(async () => {
    if (!bibleReference.trim() || !generatedImage || isLoading) return;

    setIsAudioLoading(true);
    setError(null);
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
    setGeneratedAudioUrl(null);
    setNarratedText(null);

    try {
        setLoadingMessage('Buscando texto para narração...');
        const verseText = await getVerseText(bibleReference, language);
        
        setLoadingMessage('Gerando a narração...');
        const audioBase64 = await generateSpeech(verseText, 'infantil');
        const audioBlob = createWavBlob(audioBase64);
        const url = URL.createObjectURL(audioBlob);

        setNarratedText(verseText);
        setGeneratedAudioUrl(url);

    } catch(err: any) {
        console.error(err);
        setError((err as Error).message || 'Falha ao gerar a narração.');
    } finally {
        setIsAudioLoading(false);
        setLoadingMessage('');
    }
  }, [bibleReference, generatedImage, language, isLoading, generatedAudioUrl]);

  const handleNextVerse = useCallback(() => {
    const nextVerseRef = getNextVerseRef();
    if (!nextVerseRef || isLoading) return;

    setBibleReference(nextVerseRef);
    setGeneratedImage(null);
    setError(null);
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
    setGeneratedAudioUrl(null);
    setNarratedText(null);
    // Note: characterDescriptions are kept for consistency
  }, [getNextVerseRef, isLoading, generatedAudioUrl]);

  const handleDownload = (base64Image: string) => {
    if (!base64Image) return;
    const link = document.createElement('a');
    link.href = base64Image;
    const fileName = `${bibleReference.replace(/[: ]/g, '_').toLowerCase()}.jpg`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
      {/* Input Section */}
      {!generatedImage && (
        <div className="w-full bg-slate-800/60 rounded-xl p-6 shadow-2xl shadow-cyan-500/10 border border-slate-700">
            <div className="flex-grow">
              <label htmlFor="bible-ref" className="block text-lg font-medium text-gray-300 mb-2">Referência Bíblica</label>
              <input
                id="bible-ref"
                type="text"
                value={bibleReference}
                onChange={(e) => setBibleReference(e.target.value)}
                placeholder="Ex: Gênesis 1:1"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition duration-300 disabled:bg-slate-800 disabled:cursor-not-allowed"
                disabled={isLoading}
              />
            </div>
        </div>
      )}
    
      {/* Controls & Options Section */}
      {!generatedImage && (
        <div className="w-full bg-slate-800/60 rounded-xl p-6 shadow-2xl shadow-cyan-500/10 border border-slate-700 flex flex-col gap-4">
            {/* Advanced Options Toggle */}
            <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex justify-between items-center w-full text-left text-gray-300 hover:text-white"
            >
                <span className="font-semibold">Opções Avançadas</span>
                <ChevronDownIcon className={`w-5 h-5 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>

            {/* Collapsible Options */}
            {showAdvanced && (
                <div className="flex flex-col gap-4 border-t border-slate-700 pt-4">
                     <div className="mb-2">
                        <p className="block text-sm font-medium text-gray-400 mb-2 text-center">Formato da Imagem</p>
                        <div className="flex items-center justify-center gap-4">
                            <div>
                                <input type="radio" id="aspect-9-16" name="aspectRatio" value="9:16" checked={aspectRatio === '9:16'} onChange={() => setAspectRatio('9:16')} disabled={isLoading} className="sr-only peer"/>
                                <label htmlFor="aspect-9-16" className="flex flex-col items-center text-sm gap-1 justify-center px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg cursor-pointer peer-checked:border-cyan-500 peer-checked:ring-2 peer-checked:ring-cyan-500/50 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed transition-all">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5"><rect x="7" y="3" width="10" height="18" rx="1" stroke="currentColor" strokeWidth="2"/></svg>
                                    <span>Vertical</span>
                                </label>
                            </div>
                            <div>
                                <input type="radio" id="aspect-16-9" name="aspectRatio" value="16:9" checked={aspectRatio === '16:9'} onChange={() => setAspectRatio('16:9')} disabled={isLoading} className="sr-only peer" />
                                <label htmlFor="aspect-16-9" className="flex flex-col items-center text-sm gap-1 justify-center px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg cursor-pointer peer-checked:border-cyan-500 peer-checked:ring-2 peer-checked:ring-cyan-500/50 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed transition-all">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5"><rect x="3" y="7" width="18" height="10" rx="1" stroke="currentColor" strokeWidth="2"/></svg>
                                    <span>Horizontal</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="language-select" className="block text-sm font-medium text-gray-400 mb-1">Idioma da Narração</label>
                        <select id="language-select" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isLoading} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none transition duration-300">
                            {Object.entries(LANGUAGES).map(([code, name]) => (<option key={code} value={code}>{name}</option>))}
                        </select>
                    </div>
                </div>
            )}
            
            {/* Main Action Button */}
            <button
                onClick={handleGenerateImage}
                disabled={!bibleReference.trim() || isLoading}
                className="mt-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:from-cyan-600 hover:to-blue-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-full"
            >
                {isImageLoading ? <Spinner /> : 'Gerar Imagem'}
            </button>
        </div>
      )}

      {/* Loading & Error Display */}
      {isLoading && (
        <div className="text-center p-4 bg-slate-800 rounded-lg w-full flex flex-col items-center gap-2">
            <Spinner/>
            <p className="text-cyan-400">{loadingMessage}</p>
        </div>
      )}

      {error && (
        <div className="text-center p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 w-full">
          <p>{error}</p>
        </div>
      )}

      {/* Generated Content */}
      {generatedImage && (
        <div className={`w-full flex flex-col items-center gap-4 ${aspectRatio === '9:16' ? 'max-w-md' : 'max-w-2xl'}`}>
           <div className="w-full relative group">
              <h2 className="text-xl font-semibold text-center mb-2 text-cyan-400">{bibleReference}</h2>
              <img
                src={generatedImage}
                alt={`Cena de ${bibleReference}`}
                className="rounded-xl shadow-lg shadow-black/50 border-2 border-slate-700 w-full"
              />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl">
                 <button
                    onClick={() => handleDownload(generatedImage)}
                    className="bg-white/20 backdrop-blur-sm text-white font-bold py-3 px-5 rounded-lg hover:bg-white/30 transition duration-300 flex items-center gap-2"
                  >
                    <DownloadIcon />
                    Baixar Imagem
                  </button>
              </div>
           </div>
           
            {generatedAudioUrl && (
                <div className="w-full flex flex-col gap-4">
                {narratedText && (
                    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700">
                        <p className="text-gray-300 italic text-center">"{narratedText}"</p>
                    </div>
                )}
                <audio controls src={generatedAudioUrl} className="w-full">
                    Seu navegador não suporta o elemento de áudio.
                </audio>
                </div>
            )}
           
             <div className="w-full mt-4 flex flex-col gap-3">
               <button
                 onClick={handleGenerateAudio}
                 disabled={isLoading}
                 className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-600 hover:to-indigo-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
               >
                 {isAudioLoading ? <Spinner /> : 'Gerar Narração Infantil'}
               </button>
               <button
                 onClick={handleNextVerse}
                 disabled={isLoading}
                 className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 px-4 rounded-lg hover:from-green-600 hover:to-emerald-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
               >
                 {`Próximo Versículo (${getNextVerseRef()})`}
               </button>
                <button
                onClick={handleStartNew}
                disabled={isLoading}
                className="w-full bg-red-600/80 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition duration-300 disabled:opacity-50"
                >
                Nova Cena
                </button>
             </div>
        </div>
      )}
    </div>
  );
};

export default ImageGenerator;