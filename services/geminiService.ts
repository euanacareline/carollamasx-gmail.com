import { GoogleGenAI, Modality, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const STYLE_PROMPT_APPENDIX = `, no estilo de um desenho da Pixar, personagens expressivos, iluminação cinematográfica, 3D, 4K, alto detalhe`;

export interface SceneGenerationResult {
  scenePrompt: string;
  characterDescriptions: Record<string, string>;
}

/**
 * Generates a descriptive prompt and character descriptions for a Bible scene.
 * Can be used to start a new scene or continue an existing one with consistent characters.
 * @param bibleReference - The Bible verse (e.g., "Gênesis 1:5").
 * @param existingCharacters - Optional map of character names to their descriptions for consistency.
 * @returns A promise that resolves to an object containing the scene prompt and character descriptions.
 */
export const generateImagePrompt = async (
  bibleReference: string,
  existingCharacters?: Record<string, string>
): Promise<SceneGenerationResult> => {
  try {
    const isContinuation = existingCharacters && Object.keys(existingCharacters).length > 0;

    // Convert existing characters to the array format for the prompt
    const existingCharsAsArray = isContinuation
      ? Object.entries(existingCharacters).map(([name, description]) => ({ name, description }))
      : [];

    const characterInstructions = isContinuation
      ? `Você DEVE usar as seguintes descrições de personagens para consistência: ${JSON.stringify(existingCharsAsArray, null, 2)}. Não altere essas descrições.`
      : `Sua primeira tarefa é criar descrições detalhadas e reutilizáveis para cada personagem na cena. Seja específico sobre características faciais, cabelo, roupas, idade e físico para que possam ser recriados de forma idêntica.`;

    const prompt = `
Sua tarefa é analisar o versículo bíblico '${bibleReference}' e gerar um objeto JSON para criar uma cena visual.
Sua prioridade máxima é a precisão teológica, histórica e a consistência visual dos personagens em cenas sequenciais.

${characterInstructions}

Se o versículo bíblico solicitado não existir (por exemplo, o próximo versículo após o final de um capítulo), sua resposta JSON DEVE ser: { "error": "VERSE_NOT_FOUND" }. Não tente adivinhar ou criar conteúdo.

Baseado na sua análise e nas instruções de personagem, gere um objeto JSON com o seguinte formato:
{
  "scenePrompt": "Um parágrafo único, detalhado e vívido, descrevendo a nova cena, o ambiente, a iluminação e a ação principal. Este será usado para gerar a imagem.",
  "characterDescriptions": [
    {
      "name": "NomeDoPersonagem1",
      "description": "Descrição visual detalhada e reutilizável..."
    },
    {
      "name": "NomeDoPersonagem2",
      "description": "Descrição visual detalhada e reutilizável..."
    }
  ]
}

- **Regra Crítica: Fidelidade Bíblica na Aparência:** A aparência física DEVE ser sua prioridade máxima.
  - **Base Teológica:** Baseie-se estritamente em descrições bíblicas e no contexto histórico do antigo Oriente Médio.
  - **Inferência Lógica:** Vá além do texto literal. Você DEVE inferir características físicas a partir de detalhes narrativos. Por exemplo, a Bíblia descreve o sacerdote Eli como "velho e pesado" (1 Samuel 4:18). Portanto, sua descrição visual DEVE refleti-lo como um homem idoso, significativamente acima do peso e de baixa estatura para acentuar sua corpulência. Aplique essa mesma lógica de inferência para TODOS os personagens.
  - **Etnia:** Evite representações eurocêntricas. Todos os personagens devem ter traços consistentes com a etnia do Oriente Médio (pele morena, cabelo escuro, etc.), a menos que o texto especifique o contrário.

- **Regra de Segurança CRÍTICA (Prioridade Máxima):** O prompt gerado será usado por uma IA de imagem com filtros de segurança MUITO rigorosos. A falha em seguir estas regras resultará em um erro de geração. Sua tarefa é criar um prompt que SEJA SEGURO.
  - **PROIBIDO Conteúdo Violento:** NÃO descreva sangue, ferimentos, armas em uso, combate, morte explícita ou qualquer forma de violência gráfica. Esta é a principal causa de falha.
  - **FOCO NO EMOCIONAL E IMPLÍCITO:** Em vez de descrever a ação violenta, foque 100% nas emoções dos personagens, nas reações e no resultado da ação.
    - **Exemplo RUIM (Resulta em erro):** "Davi atirou a pedra que atingiu a testa de Golias, que caiu morto."
    - **Exemplo BOM (Funciona):** "Davi observa com determinação enquanto o gigante Golias, com uma expressão de surpresa, cambaleia e cai no chão, derrotado. A tensão no campo de batalha se transforma em espanto."
    - **Exemplo RUIM (Resulta em erro):** "Eli caiu e quebrou o pescoço."
    - **Exemplo BOM (Funciona):** "O sacerdote Eli, ao ouvir a notícia trágica, cai para trás de sua cadeira em choque, seu corpo imóvel no chão, enquanto as pessoas ao redor reagem com desespero."
  - **PROIBIDO Conteúdo Adulto:** NÃO descreva nudez ou roupas reveladoras. Os personagens devem usar vestimentas modestas e historicamente apropriadas.
  - **Palavras-Chave a Evitar:** Evite estritamente palavras como "matar", "sangue", "ferida", "morte", "luta", "batalha", "arma", "nudez". Descreva a cena de forma a contornar essas palavras.

- **JSON de Saída:** Sua resposta final deve ser APENAS o objeto JSON, sem nenhum texto ou formatação adicional. Se você está continuando uma cena, a lista 'characterDescriptions' retornada deve ser a mesma que foi fornecida, a menos que um novo personagem seja introduzido.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             error: { type: Type.STRING, description: 'Campo de erro opcional.', nullable: true },
            scenePrompt: {
              type: Type.STRING,
              description: 'O prompt detalhado para gerar a imagem.',
            },
            characterDescriptions: {
              type: Type.ARRAY,
              description: 'Uma lista de objetos, cada um contendo o nome e a descrição de um personagem.',
              items: {
                  type: Type.OBJECT,
                  properties: {
                      name: { type: Type.STRING, description: 'O nome do personagem.'},
                      description: { type: Type.STRING, description: 'A descrição visual do personagem.'}
                  },
                  required: ['name', 'description']
              }
            },
          },
        },
      },
    });

    const rawText = response.text.trim();
    // The model sometimes wraps the JSON in markdown backticks or adds extra text. 
    // This function extracts the clean JSON string.
    const extractJsonString = (str: string): string => {
        const match = str.match(/\{[\s\S]*\}/);
        return match ? match[0] : str;
    };
    const jsonString = extractJsonString(rawText);

    try {
        interface ApiResponse {
            scenePrompt?: string;
            characterDescriptions?: { name: string; description: string; }[];
            error?: string;
        }
        
        const parsedJson: ApiResponse = JSON.parse(jsonString);
        
        if (parsedJson.error === 'VERSE_NOT_FOUND') {
            throw new Error('VERSE_NOT_FOUND');
        }

        if (!parsedJson.scenePrompt || !parsedJson.characterDescriptions) {
            throw new Error("Resposta da IA com campos ausentes.");
        }

        const characterDescriptionsMap = parsedJson.characterDescriptions.reduce((acc, char) => {
            acc[char.name] = char.description;
            return acc;
        }, {} as Record<string, string>);

        return {
            scenePrompt: parsedJson.scenePrompt,
            characterDescriptions: characterDescriptionsMap,
        };
    } catch (e: any) {
        if (e.message === 'VERSE_NOT_FOUND') {
            throw e; 
        }
        console.error("Failed to parse JSON response from AI:", rawText);
        throw new Error("Falha ao processar a resposta da IA. O formato pode ser inválido.");
    }

  } catch (error) {
    console.error("Error generating image prompt:", error);
    throw error;
  }
};


/**
 * Generates an image based on a descriptive prompt.
 * @param prompt - The descriptive prompt for the image.
 * @param aspectRatio - The desired aspect ratio for the image.
 * @returns A promise that resolves to the base64 encoded image string.
 */
export const generateImage = async (prompt: string, aspectRatio: '9:16' | '16:9'): Promise<string> => {
  try {
    const fullPrompt = prompt + STYLE_PROMPT_APPENDIX;

    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: aspectRatio,
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      return response.generatedImages[0].image.imageBytes;
    } else {
      throw new Error("A imagem não pôde ser gerada. Isso pode ocorrer devido a filtros de segurança sobre o conteúdo da cena. Tente um versículo diferente ou uma nova cena com uma descrição menos explícita.");
    }
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

const languageMap: { [key: string]: string } = {
    'pt-BR': 'Português (Brasil)',
    'en-US': 'Inglês (EUA)',
    'es-ES': 'Espanhol (Espanha)',
    'fr-FR': 'Francês (França)',
    'de-DE': 'Alemão (Alemanha)',
};

/**
 * Fetches the text of a specific Bible verse.
 * @param bibleReference - The Bible verse (e.g., "Gênesis 1:5").
 * @param language - The language code for the text (e.g., 'pt-BR').
 * @returns A promise that resolves to the verse text as a string.
 */
export const getVerseText = async (bibleReference: string, language: string): Promise<string> => {
  try {
    const languageName = languageMap[language] || 'Português (Brasil)';
    const textPrompt = `Forneça o texto completo de '${bibleReference}' da Bíblia no idioma ${languageName}. Responda apenas com o texto do versículo, sem introduções ou explicações adicionais.`;
    const textResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: textPrompt,
    });
    const bibleText = textResponse.text.trim();

    if (!bibleText) {
      throw new Error("Não foi possível obter o texto do versículo.");
    }
    return bibleText;
  } catch (error) {
    console.error("Error fetching verse text:", error);
    throw error;
  }
};


/**
 * Generates spoken audio from a given text.
 * @param textToNarrate - The text to be converted to speech.
 * @param voiceType - The type of voice ('adulta' or 'infantil').
 * @returns A promise that resolves to the base64 encoded audio string.
 */
export const generateSpeech = async (textToNarrate: string, voiceType: 'adulta' | 'infantil'): Promise<string> => {
  try {
    if (!textToNarrate) {
        throw new Error("O texto para narração não pode estar vazio.");
    }
    
    const voiceName = voiceType === 'adulta' ? 'Puck' : 'Kore';
    let promptForAudio = textToNarrate;

    if (voiceType === 'infantil') {
      promptForAudio = `Narração em tom de criança, com uma voz doce e clara: ${textToNarrate}`;
    }
    
    const audioResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: promptForAudio }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
        },
      },
    });

    const base64Audio = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return base64Audio;
    } else {
      throw new Error("A API não retornou nenhum áudio.");
    }
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};
