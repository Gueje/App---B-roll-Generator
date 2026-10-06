import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType, CustomStyle } from "../types";

// Standard model from skill definitions (fast, high RPM quota, prevents Pro quota exhaustion)
const FLASH_MODEL = "gemini-3.8-flash"; 

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generates a concise visual master context (max 2 lines) in Spanish.
 * Uses gemini-3.8-flash with Google Search grounding if possible, or fallback without tools.
 */
export const getGlobalContext = async (
  fullText: string,
  apiKey: string
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

  try {
    // Attempt with Google Search grounding to verify real subjects/entities
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return response.text?.trim() || "Documental temático con enfoque cinematográfico y metraje de archivo.";
  } catch (err) {
    console.warn("Search-grounded context analysis unavailable, falling back to direct analysis", err);
    try {
      const response = await ai.models.generateContent({
        model: FLASH_MODEL,
        contents: prompt,
      });
      return response.text?.trim() || "Documental temático con enfoque cinematográfico y metraje de archivo.";
    } catch (innerErr: any) {
      console.error("Direct context analysis failed", innerErr);
      return "Documental temático con enfoque cinematográfico y metraje de archivo.";
    }
  }
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

  // Extract primary subject noun phrase from master context (first 4 words)
  const masterSubject = masterContext
    .replace(/[^\w\sáéíóúñ]/g, ' ')
    .split(/\s+/)
    .slice(0, 4)
    .join(' ') || 'documental b-roll';

  const mainQuery = `${masterSubject} ${cleanWords || 'archivo metraje cinematografico'}`.trim();
  const ytQuery = `${masterSubject} b-roll metraje metraje historico`.trim();
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
  providedContext?: string 
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey });

  // Optimal chunk size: 15 segments.
  // 30 segments = 2 calls instead of 4, cutting RPM usage in half while keeping token size comfortably within Flash limits.
  const CHUNK_SIZE = 15;
  const chunkedSegments: ScriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    chunkedSegments.push(segments.slice(i, i + CHUNK_SIZE));
  }

  const allRawData: any[] = [];
  
  // Anchor strictly to the provided master context. Never allow it to be empty.
  const finalContext = (providedContext && providedContext.trim().length > 0)
    ? providedContext.trim()
    : "Documental con metraje cinematográfico de alta calidad y archivo contextual.";

  for (let i = 0; i < chunkedSegments.length; i++) {
    const chunk = chunkedSegments[i];
    
    // Previous narrative context for smooth visual continuity
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
    const maxAttempts = 4;
    let success = false;
    let lastError: any = null;

    while (attempts < maxAttempts && !success) {
      try {
        const response = await ai.models.generateContent({
          model: FLASH_MODEL,
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
          // Pacing delay between successful chunks (1500ms) to prevent hitting RPM limits
          if (i < chunkedSegments.length - 1) {
            await delay(1500);
          }
        }
      } catch (err: any) {
        attempts++;
        lastError = err;
        const errMsg = String(err.message || "");
        const isQuota = errMsg.includes("429") || 
                        errMsg.includes("RESOURCE_EXHAUSTED") || 
                        errMsg.includes("quota") || 
                        errMsg.includes("rate limit") ||
                        err.status === 429;
        const isServerBusy = errMsg.includes("503") || errMsg.includes("overloaded");

        // Progressive backoff: on quota (429), wait substantially longer to allow the per-minute window to reset
        const pauseTime = isQuota 
          ? Math.min(6000 * attempts, 25000) 
          : isServerBusy 
            ? 5000 * attempts 
            : 2500 * attempts;
        
        console.warn(`Lote ${i + 1}/${chunkedSegments.length} intento ${attempts} falló (${errMsg}). Esperando ${pauseTime}ms antes de reintentar...`);
        await delay(pauseTime);
      }
    }

    if (!success) {
      const errMsg = String(lastError?.message || "");
      if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
        throw new Error(
          "Límite de cuota alcanzado (Error 429 - Rate Limit). La API de Gemini necesita un momento para restablecer su cuota por minuto. Por favor espera 30-45 segundos y vuelve a pulsar el botón para continuar con este lote."
        );
      } else {
        throw new Error(
          `No se pudo completar el lote de visuales tras varios reintentos: ${errMsg || "Error de conexión con la IA"}.`
        );
      }
    }
  }

  // Map results back to original segments with rigorous visual guarantees
  return segments.map(segment => {
    const found = allRawData.find(r => String(r.segmentId) === String(segment.id));
    
    // Synthesize fallback visual query if anything is missing - NEVER fall back to literal raw narrator text
    const fallback = synthesizeVisualFallback(segment.originalText, finalContext);

    // Validate that mainQuery does not literally equal the narrative segment
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
