import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType, CustomStyle } from "../types";

// Resilient pool of high-capacity models with automatic failover
export const AVAILABLE_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite"
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cleanly extracts a human-friendly message from Gemini API errors,
 * stripping raw JSON objects like {"error":{"code":503,...}}
 */
export const cleanErrorMessage = (error: any): string => {
  if (!error) return "Error desconocido al comunicarse con la IA.";
  const rawMsg = typeof error === "string" ? error : String(error.message || JSON.stringify(error));

  if (rawMsg.includes("503") || rawMsg.includes("high demand") || rawMsg.includes("UNAVAILABLE") || rawMsg.includes("overloaded")) {
    return "Los servidores de Google Gemini están experimentando una alta demanda momentánea (Error 503: Spikes in demand). La aplicación cambiará de modelo automáticamente; por favor pulsa 'Reintentar Lote'.";
  }

  if (rawMsg.includes("429") || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota") || rawMsg.includes("rate limit")) {
    return "Se ha alcanzado temporalmente el límite de cuota por minuto de la API (Error 429). Por favor espera 30-45 segundos antes de generar el siguiente lote.";
  }

  if (rawMsg.includes("API key not valid") || rawMsg.includes("API_KEY_INVALID")) {
    return "La API Key de Gemini configurada no es válida. Por favor revísala en Configuración.";
  }

  // Attempt to parse nested JSON if present
  try {
    const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error?.message) {
        return parsed.error.message;
      }
    }
  } catch {}

  return rawMsg;
};

/**
 * Generates a concise visual master context (max 2 lines) in Spanish.
 * Iterates through candidate models if 503 or 429 occurs.
 */
export const getGlobalContext = async (
  fullText: string,
  apiKey: string,
  preferredModel?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
Analiza el siguiente guion audiovisual y define el TEMA MAESTRO Y CONTEXTO VISUAL en máximo 2 líneas.
CRITERIOS OBLIGATORIOS:
1. Identifica el sujeto/entidad principal exacto (persona, lugar, suceso histórico, producto o tecnología).
2. Especifica el entorno, época y estilo visual dominante (ej. documental de archivo, metraje cinematográfico oscuro, estilo corporativo moderno).
3. Responde ÚNICAMENTE en ESPAÑOL en máximo 2 renglones concisos.

GUION:
${fullText.substring(0, 8000)}
  `;

  const modelsToTry = preferredModel && preferredModel !== "Auto"
    ? [preferredModel, ...AVAILABLE_MODELS.filter(m => m !== preferredModel)]
    : AVAILABLE_MODELS;

  for (const model of modelsToTry) {
    try {
      // First attempt with Google Search grounding if possible
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      if (response.text?.trim()) {
        return response.text.trim();
      }
    } catch (err: any) {
      // If tools aren't supported or 503 occurs, try direct content generation without tools
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        if (response.text?.trim()) {
          return response.text.trim();
        }
      } catch (innerErr: any) {
        console.warn(`Context generation with model ${model} failed, trying next candidate...`, innerErr?.message);
      }
    }
  }

  return "Documental temático con enfoque cinematográfico y metraje de archivo contextual.";
};

/**
 * Helper to synthesize visual search keywords if a segment is ever missing from AI output.
 * NEVER returns raw script monologue/narration.
 */
const synthesizeVisualFallback = (
  text: string, 
  masterContext: string
): { mainQuery: string; ytQuery: string; stockQuery: string; intent: string } => {
  const stopWords = new Set([
    'el','la','los','las','un','una','unos','unas','de','del','a','en','para','por','con','sin','sobre',
    'como','cuando','donde','porque','que','y','o','pero','si','no','mas','su','sus','se','le','les','lo',
    'al','ya','muy','este','esta','estos','estas','todo','toda','todos','todas','era','fue','habia','fueron',
    'sido','tener','tenia','tenian','hacer','hizo','hacia','decir','dijo','mientras','despues','entonces'
  ]);

  const cleanWords = text
    .toLowerCase()
    .replace(/[^\w\sáéíóúñ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 4)
    .join(' ');

  const masterSubject = masterContext
    .replace(/[^\w\sáéíóúñ]/g, ' ')
    .split(/\s+/)
    .slice(0, 4)
    .join(' ') || 'documental b-roll';

  const mainQuery = `${masterSubject} ${cleanWords || 'metraje historico'}`.trim();
  const ytQuery = `${masterSubject} ${cleanWords || 'documental'} archivo metraje video`.trim();
  const stockQuery = `${cleanWords || 'cinematic b-roll footage'}`.trim();
  const intent = `Toma cinematográfica representativa vinculada a ${masterSubject}: ${cleanWords}`;

  return { mainQuery, ytQuery, stockQuery, intent };
};

export const generateBrollPlan = async (
  segments: ScriptSegment[],
  apiKey: string,
  userStyle: string = "Auto-Detect",
  userTone: string = "Auto-Detect",
  aspectRatio: string = "16:9",
  resolution: string = "4k",
  customStyle?: CustomStyle,
  providedContext?: string,
  preferredModel?: string
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey });

  // Chunk size: 8-10 segments provides optimal balance between payload size, token latency, and RPM consumption.
  const CHUNK_SIZE = 8;
  const chunkedSegments: ScriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    chunkedSegments.push(segments.slice(i, i + CHUNK_SIZE));
  }

  const allRawData: any[] = [];
  
  // Anchor strictly to the provided master context. Never allow it to be empty.
  const finalContext = (providedContext && providedContext.trim().length > 0)
    ? providedContext.trim()
    : "Documental temático con metraje cinematográfico de alta calidad y archivo contextual.";

  // Candidate models pool with auto-rotation
  const modelsPool = preferredModel && preferredModel !== "Auto"
    ? [preferredModel, ...AVAILABLE_MODELS.filter(m => m !== preferredModel)]
    : AVAILABLE_MODELS;

  let currentModelIndex = 0;

  // Build the explicit style directive block
  let styleDirective = "";
  if (customStyle) {
    styleDirective = `
======================================================================
*** ESTILO VISUAL PERSONALIZADO ACTIVO (OBLIGATORIO Y PRIORITARIO) ***
Nombre del Estilo Creado por el Usuario: "${customStyle.name}"
Instrucción Maestra de Estilo del Usuario:
"""
${customStyle.instruction}
"""

REGLAS ABSOLUTAS PARA EL ESTILO PERSONALIZADO:
1. El campo 'aiPrompt' DEBE incorporar obligatoriamente la técnica, medio artístico (óleo, acuarela, 35mm, animación, render 3D, cómic, etc.), paleta de color, texturas e iluminación detalladas en la instrucción anterior.
2. Si la instrucción del usuario contiene marcadores o variables como [INSERTA AQUÍ LA DESCRIPCIÓN], [DESCRIPCIÓN], [ESCENA], [SCENE] o similar, DEBES sustituir ese marcador exactamente con la escena narrativa lógica correspondiente a ese bloque del guion, manteniendo la fórmula intacta del estilo.
3. Si no contiene marcadores explícitos, aplica toda la técnica y estética descrita en la instrucción a la escena concreta del bloque.
4. JAMÁS descartes el estilo del usuario ni lo reemplaces por fórmulas genéricas ("Cinematic photorealistic 35mm") si la instrucción pide otro tipo de arte.
======================================================================`;
  } else if (userStyle && userStyle !== "Auto-Detect") {
    styleDirective = `
======================================================================
*** ESTILO VISUAL SELECCIONADO: "${userStyle}" ***
- El campo 'aiPrompt' debe reflejar fielmente la estética, óptica, tratamiento visual, textura e iluminación propios de "${userStyle}".
======================================================================`;
  } else {
    styleDirective = `
======================================================================
*** ESTILO VISUAL ***
- Estilo documental cinematográfico de alta gama, adaptado coherentemente al tono del guion.
======================================================================`;
  }

  for (let i = 0; i < chunkedSegments.length; i++) {
    const chunk = chunkedSegments[i];
    
    // Continuity context from previous segments
    const prevContext = i > 0 
      ? segments.slice(Math.max(0, i * CHUNK_SIZE - 2), i * CHUNK_SIZE).map(s => s.originalText).join(" ") 
      : "";

    const prompt = `
CRITICAL DIRECTIVE: Genera especificaciones de B-Roll de máxima rigurosidad y prompts visuales narrativos lógicos para cada bloque de este guion.

TEMA MAESTRO Y CONTEXTO GENERAL DEL GUION:
"${finalContext}"

${prevContext ? `CONTINUIDAD NARRATIVA ANTERIOR: "${prevContext}"` : ""}

PARÁMETROS VISUALES:
${styleDirective}
- Tono Narrativo: ${userTone}
- Relación de Aspecto: ${aspectRatio}
- Resolución Objetivo: ${resolution}

BLOQUES DEL GUION A PROCESAR (MANTÉN "segmentId" EXACTAMENTE IGUAL):
${JSON.stringify(chunk.map(s => ({ segmentId: s.id, narrationText: s.originalText })))}
    `;

    const systemInstruction = `Eres un Director de Fotografía, Documentalista e Investigador de Archivo Visual de nivel internacional.

REGLAS FUNDAMENTALES DE RIGUROSIDAD Y ESPECIFICIDAD POR BLOQUE:

1. PROHIBICIÓN TOTAL DE BÚSQUEDAS GENÉRICAS O REPETITIVAS:
   - Cada bloque del guion relata un momento, personaje, acción, herramienta, lugar, objeto, documento o situación específica.
   - Las búsquedas ('mainQuery', 'youtubeQuery', 'stockQuery') NO DEBEN SER GENÉRICAS ni idénticas entre bloques.
   - PROHIBIDO usar plantillas clonadas como "[Sujeto] metraje cinematográfico plano general" o "[Sujeto] archivo historico documental 4k" para todos los bloques.
   - Cada búsqueda debe identificar los SUSTANTIVOS, ACCIONES Y ELEMENTOS VISUALES ESPECÍFICOS de ese bloque concreto en relación con el tema maestro.
   - JAMÁS copies ni repitas la frase textual de la narración/locución: el guion es audio oral; las queries son TÉRMINOS VISUALES DIRECTOS para motores de búsqueda.

2. 'mainQuery' (Para Google Images y Pinterest):
   - Términos de búsqueda directos y precisos en español (o con nombres propios/técnicos históricos/científicos).
   - Combina el sujeto/entidad del tema maestro con el elemento, acción u objeto tangible que ocurre en ESTE bloque.
   - Diseñado para que al hacer clic en Google o Pinterest aparezcan fotos, referencias o documentos reales y específicos de esa escena.
   - Sin palabras de relleno vacías (prohibido poner "plano general", "alta calidad", "4k"). Usa sustantivos y descriptores reales.
   - Ejemplo: si el bloque habla de "Turing y el equipo descifrando la máquina Enigma en la cabaña 8 de Bletchley Park", 'mainQuery': "Alan Turing maquina Enigma Bletchley Park cabaña 8 descifrado".

3. 'youtubeQuery' (Para YouTube):
   - Términos específicos para encontrar vídeos reales, entrevistas, documentales temáticos, archivo histórico o metraje en movimiento del tema de ESTE bloque.
   - Debe variar en cada bloque según el suceso narrado.
   - Ejemplo: "Alan Turing descifrado Enigma Bletchley Park documental archivo historico" o "maquina Enigma funcionamiento documental".

4. 'stockQuery' (Para Pexels y Unsplash en INGLÉS):
   - 2 a 5 palabras clave en INGLÉS que describan los elementos físicos y visuales visibles en pantalla (objetos, entorno, personas, acciones).
   - Pexels y Unsplash indexan en inglés. Proporcionar estas palabras clave en inglés garantiza que los enlaces devuelvan vídeos y fotos reales de stock de altísima calidad que coincidan exactamente con la escena.
   - Ejemplo: "vintage cryptography machine code breaker laboratory 1940s".

5. REGLAS ESTRICTAS PARA 'aiPrompt' (PROMPT PARA IA GENERATIVA):
   - APLICACIÓN OBLIGATORIA DEL ESTILO: Si se proporcionó un estilo personalizado o seleccionado, el prompt DEBE tomar obligatoriamente la técnica artística, medio (acuarela, óleo, 35mm film, anime, render 3D, cyberpunk, etc.), paleta de color y estética dictadas por el usuario. Si la instrucción del usuario tiene un marcador como [INSERTA AQUÍ LA DESCRIPCIÓN], rellena ese marcador con la escena concreta del bloque y mantén la estructura del estilo.
   - CERO ABSTRACCIÓN — NARRATIVA LÓGICA Y COHERENTE CON EL GUION:
     - PROHIBIDO generar conceptos abstractos, figuras etéreas, orbes luminosos flotantes, metáforas vacías o escenas surrealistas sin sentido.
     - El prompt DEBE representar una escena LÓGICA, FÍSICA y TANGIBLE que le dé sentido visual exacto a lo que se relata en este bloque del guion.
     - Debe ilustrar la acción, personajes, objetos y entorno físico real que el narrador está describiendo, de modo que el espectador entienda visualmente la narración.
     - Debe estar en inglés (para Midjourney, Imagen, Flux, DALL-E) y terminar con los parámetros técnicos de aspecto: "--ar ${aspectRatio}".

6. 'visualIntent':
   - En español. Descripción clara y cinematográfica para el editor de vídeo de lo que debe verse en pantalla para ilustrar este fragmento del guion.`;

    let attempts = 0;
    const maxAttempts = 5;
    let success = false;
    let lastError: any = null;

    while (attempts < maxAttempts && !success) {
      const activeModel = modelsPool[currentModelIndex % modelsPool.length];

      try {
        const response = await ai.models.generateContent({
          model: activeModel,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  segmentId: { type: Type.STRING },
                  visualIntent: { type: Type.STRING },
                  mediaType: { type: Type.STRING, enum: ["VIDEO", "IMAGE"] },
                  searchQuery: {
                    type: Type.OBJECT,
                    properties: {
                      mainQuery: { type: Type.STRING },
                      youtubeQuery: { type: Type.STRING },
                      stockQuery: { type: Type.STRING }
                    },
                    required: ["mainQuery", "youtubeQuery", "stockQuery"]
                  },
                  aiPrompt: { type: Type.STRING }
                },
                required: ["segmentId", "visualIntent", "mediaType", "searchQuery", "aiPrompt"]
              }
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Respuesta vacía de la IA.");
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          allRawData.push(...data);
          success = true;
          // Pacing delay between successful chunks
          if (i < chunkedSegments.length - 1) {
            await delay(1200);
          }
        }
      } catch (err: any) {
        attempts++;
        lastError = err;
        const errMsg = String(err.message || "");
        
        const is503HighDemand = errMsg.includes("503") || 
                               errMsg.includes("high demand") || 
                               errMsg.includes("UNAVAILABLE") || 
                               errMsg.includes("overloaded");
                               
        const isQuota429 = errMsg.includes("429") || 
                           errMsg.includes("RESOURCE_EXHAUSTED") || 
                           errMsg.includes("quota") || 
                           errMsg.includes("rate limit") ||
                           err.status === 429;

        // Auto-failover on 503
        if (is503HighDemand) {
          currentModelIndex++;
          const nextModel = modelsPool[currentModelIndex % modelsPool.length];
          console.warn(`[Auto-Failover] Modelo ${activeModel} en alta demanda (503). Conmutando al modelo: ${nextModel}...`);
          await delay(1500);
          continue;
        }

        // Auto-failover on 429
        if (isQuota429) {
          currentModelIndex++;
          const pauseTime = Math.min(4000 * attempts, 16000);
          console.warn(`[Quota 429] Límite por minuto. Pausando ${pauseTime}ms y probando siguiente modelo...`);
          await delay(pauseTime);
          continue;
        }

        // Standard backoff
        const pauseTime = 2000 * attempts;
        console.warn(`Lote ${i + 1}/${chunkedSegments.length} intento ${attempts} falló (${errMsg}). Reintentando en ${pauseTime}ms...`);
        await delay(pauseTime);
      }
    }

    if (!success) {
      const friendlyMsg = cleanErrorMessage(lastError);
      throw new Error(`No se pudo completar el lote de visuales: ${friendlyMsg}`);
    }
  }

  // Active style label for display in suggestion cards
  const displayStyleName = customStyle ? customStyle.name : (userStyle !== "Auto-Detect" ? userStyle : "Cinematográfico");

  // Map results back to original segments with rigorous visual guarantees
  return segments.map(segment => {
    const found = allRawData.find(r => String(r.segmentId) === String(segment.id));
    
    // Synthesize fallback visual query if anything was missing
    const fallback = synthesizeVisualFallback(segment.originalText, finalContext);

    let mainQuery = found?.searchQuery?.mainQuery?.trim() || fallback.mainQuery;
    let ytQuery = found?.searchQuery?.youtubeQuery?.trim() || fallback.ytQuery;
    let stockQuery = found?.searchQuery?.stockQuery?.trim() || fallback.stockQuery;

    // Safety checks: only discard if the model literally pasted the whole raw script text
    if (mainQuery.toLowerCase() === segment.originalText.toLowerCase().trim() || mainQuery.length > 250) {
      mainQuery = fallback.mainQuery;
    }

    if (ytQuery.toLowerCase() === segment.originalText.toLowerCase().trim() || ytQuery.length > 250) {
      ytQuery = fallback.ytQuery;
    }

    const visualIntent = found?.visualIntent || fallback.intent;
    const mediaType = (found?.mediaType === "IMAGE" ? MediaType.IMAGE : MediaType.VIDEO);
    
    // Build fallback prompt adhering to style if missing
    let defaultPrompt = `Detailed cinematic shot depicting ${mainQuery}, narrative lighting, sharp focus, ${aspectRatio}`;
    if (customStyle) {
      if (customStyle.instruction.includes("[INSERTA AQUÍ LA DESCRIPCIÓN]") || customStyle.instruction.includes("[DESCRIPCIÓN]")) {
        defaultPrompt = customStyle.instruction
          .replace(/\[INSERTA AQUÍ LA DESCRIPCIÓN\]/gi, mainQuery)
          .replace(/\[DESCRIPCIÓN\]/gi, mainQuery);
      } else {
        defaultPrompt = `${customStyle.instruction}, scene: ${mainQuery}, --ar ${aspectRatio}`;
      }
    }
    const aiPrompt = found?.aiPrompt || defaultPrompt;

    // Use English stockQuery for stock platforms (Pexels, Unsplash) to ensure rich, non-empty results
    const stockSearch = encodeURIComponent(stockQuery || mainQuery);
    const mainSearch = encodeURIComponent(mainQuery);
    const ytSearch = encodeURIComponent(ytQuery);

    return {
      segmentId: segment.id,
      visualIntent,
      mediaType,
      searchQuery: {
        mainQuery,
        youtubeQuery: ytQuery,
        stockQuery,
        variants: [],
        keywords: [
          ...mainQuery.split(/\s+/).filter(w => w.length > 3).slice(0, 5)
        ]
      },
      styleParams: { 
        mood: userTone, 
        style: displayStyleName 
      },
      aiPrompt,
      sources: {
        googleImages: `https://www.google.com/search?tbm=isch&q=${mainSearch}`,
        pexels: `https://www.pexels.com/search/videos/${stockSearch}`,
        unsplash: `https://unsplash.com/s/photos/${stockSearch}`,
        pinterest: `https://www.pinterest.com/search/pins/?q=${mainSearch}`,
        youtube: `https://www.youtube.com/results?search_query=${ytSearch}`
      }
    } as BrollSuggestion;
  });
};
