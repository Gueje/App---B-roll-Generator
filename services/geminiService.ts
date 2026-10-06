import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType, CustomStyle } from "../types";

// Resilient pool of high-capacity models with automatic failover
// gemini-2.5-flash has the largest dedicated server allocation globally and rarely suffers 503 spikes
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
const synthesizeVisualFallback = (text: string, masterContext: string): { mainQuery: string; ytQuery: string; intent: string } => {
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

  const mainQuery = `${masterSubject} ${cleanWords || 'archivo metraje cinematografico'}`.trim();
  const ytQuery = `${masterSubject} b-roll metraje historico`.trim();
  const intent = `Toma cinematográfica representativa vinculada a ${masterSubject}`;

  return { mainQuery, ytQuery, intent };
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

  // Chunk size: 10 segments provides optimal balance between payload size, token latency, and RPM consumption.
  const CHUNK_SIZE = 10;
  const chunkedSegments: ScriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    chunkedSegments.push(segments.slice(i, i + CHUNK_SIZE));
  }

  const allRawData: any[] = [];
  
  // Anchor strictly to the provided master context. Never allow it to be empty.
  const finalContext = (providedContext && providedContext.trim().length > 0)
    ? providedContext.trim()
    : "Documental con metraje cinematográfico de alta calidad y archivo contextual.";

  // Candidate models pool with auto-rotation
  const modelsPool = preferredModel && preferredModel !== "Auto"
    ? [preferredModel, ...AVAILABLE_MODELS.filter(m => m !== preferredModel)]
    : AVAILABLE_MODELS;

  let currentModelIndex = 0;

  for (let i = 0; i < chunkedSegments.length; i++) {
    const chunk = chunkedSegments[i];
    
    // Continuity context from previous segments
    const prevContext = i > 0 
      ? segments.slice(Math.max(0, i * CHUNK_SIZE - 2), i * CHUNK_SIZE).map(s => s.originalText).join(" ") 
      : "";

    const prompt = `
CRITICAL INSTRUCTION: Generate high-rigor visual search queries and B-Roll specifications.

MASTER CONTEXT & SUBJECT (IMMUTABLE ANCHOR):
"${finalContext}"

${prevContext ? `PREVIOUS NARRATIVE CONTEXT (CONTINUITY): "${prevContext}"` : ""}

USER VISUAL PARAMETERS:
- Requested Style: ${customStyle ? customStyle.instruction : userStyle}
- Narrative Tone: ${userTone}
- Aspect Ratio: ${aspectRatio}
- Target Resolution: ${resolution}

INPUT SCRIPT SEGMENTS TO PROCESS (KEEP "segmentId" EXACTLY AS PROVIDED):
${JSON.stringify(chunk.map(s => ({ segmentId: s.id, narrationText: s.originalText })))}
    `;

    const systemInstruction = `Eres un Director de Fotografía, Investigador Visual y Editor de B-Roll de primer nivel para producciones documentales y cinematográficas.

REGLAS DE ORO PARA LA RIGUROSIDAD:
1. PROHIBICIÓN TOTAL DE COPIAR EL TEXTO NARRATIVO:
   - JAMÁS copies ni repitas la frase de locución/guion en 'mainQuery' o 'youtubeQuery'.
   - El guion es audio oral/narración; las queries son TÉRMINOS VISUALES CONCRETOS para motores de búsqueda de stock (Pexels, Unsplash, Google Images, Pinterest, YouTube).
   - INACEPTABLE: "Y cuando finalmente todo parecía derrumbarse a su alrededor"
   - RIGUROSO Y CORRECTO: "[Sujeto del Tema Maestro] edificio antiguo en ruinas plano general dramático atardecer"

2. ANCLAJE OBLIGATORIO AL TEMA MAESTRO:
   - Cada 'mainQuery' DEBE incluir el sujeto o entidad principal del Tema Maestro.
   - Formato exacto de 'mainQuery': [Sujeto específico del Tema Maestro] + [Acción física o elemento visual visible en pantalla] + [Entorno, iluminación o tipo de plano] (3 a 6 palabras clave visuales, directas).
   - Formato de 'youtubeQuery': Términos específicos para encontrar metraje real, entrevistas o archivo histórico: "[Sujeto del Tema Maestro] [archivo historico / metraje b-roll documental 4k]".

3. INTENCIÓN VISUAL (visualIntent):
   - Describe con precisión técnica cinematográfica lo que ve el espectador en pantalla (ej. "Plano detalle de documentos antiguos bajo luz tenue lateral", "Plano cenital en cámara lenta de multitud").

4. PROMPT PARA IA (aiPrompt):
   - Prompt fotográfico en inglés para Midjourney/Imagen (ej. "Cinematic 4K shot of [Master Subject], [action/scene], dramatic lighting, 35mm lens, photorealistic, ${aspectRatio}").

5. FORMATO DE SALIDA:
   - Devuelve un array JSON que coincida exactamente con el esquema especificado para cada segmento.`;

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
                      youtubeQuery: { type: Type.STRING }
                    },
                    required: ["mainQuery", "youtubeQuery"]
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

        // CRITICAL AUTO-FAILOVER:
        // If 503 high demand or overloaded, immediately switch to the next model in the pool!
        if (is503HighDemand) {
          currentModelIndex++;
          const nextModel = modelsPool[currentModelIndex % modelsPool.length];
          console.warn(`[Auto-Failover] Modelo ${activeModel} en alta demanda (503). Conmutando inmediatamente al modelo alternativo: ${nextModel}...`);
          // Brief pause before trying alternative model
          await delay(1500);
          continue;
        }

        // On quota 429, wait with progressive backoff and try next model
        if (isQuota429) {
          currentModelIndex++;
          const pauseTime = Math.min(5000 * attempts, 20000);
          console.warn(`[Quota 429] Límite por minuto alcanzado. Pausando ${pauseTime}ms y conmutando modelo...`);
          await delay(pauseTime);
          continue;
        }

        // Other errors: standard backoff
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

  // Map results back to original segments with rigorous visual guarantees
  return segments.map(segment => {
    const found = allRawData.find(r => String(r.segmentId) === String(segment.id));
    
    // Synthesize fallback visual query if anything is missing - NEVER fall back to literal raw narrator text
    const fallback = synthesizeVisualFallback(segment.originalText, finalContext);

    let mainQuery = found?.searchQuery?.mainQuery?.trim() || fallback.mainQuery;
    let ytQuery = found?.searchQuery?.youtubeQuery?.trim() || fallback.ytQuery;

    // Safety check: if the AI returned the literal original text or something suspiciously identical to the dialogue
    if (mainQuery.toLowerCase() === segment.originalText.toLowerCase().trim() || 
        mainQuery.length > 90) {
      mainQuery = fallback.mainQuery;
    }

    if (ytQuery.toLowerCase() === segment.originalText.toLowerCase().trim() ||
        ytQuery.length > 90) {
      ytQuery = fallback.ytQuery;
    }

    const visualIntent = found?.visualIntent || fallback.intent;
    const mediaType = (found?.mediaType === "IMAGE" ? MediaType.IMAGE : MediaType.VIDEO);
    const aiPrompt = found?.aiPrompt || `Cinematic shot representing ${mainQuery}, 4K, photorealistic, ${aspectRatio}`;

    return {
      segmentId: segment.id,
      visualIntent,
      mediaType,
      searchQuery: {
        mainQuery,
        youtubeQuery: ytQuery,
        variants: [],
        keywords: [
          ...mainQuery.split(/\s+/).filter(w => w.length > 3).slice(0, 4)
        ]
      },
      styleParams: { mood: userTone, style: userStyle },
      aiPrompt,
      sources: {
        googleImages: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(mainQuery)}`,
        pexels: `https://www.pexels.com/search/videos/${encodeURIComponent(mainQuery)}`,
        unsplash: `https://unsplash.com/s/photos/${encodeURIComponent(mainQuery)}`,
        pinterest: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(mainQuery)}`,
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`
      }
    } as BrollSuggestion;
  });
};
