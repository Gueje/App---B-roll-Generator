import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, CustomStyle, GlobalContext } from "../types";

const MODEL_NAME = "gemini-2.0-flash";

const MAX_OUTPUT_TOKENS_ANALYSIS = 2048;
const MAX_OUTPUT_TOKENS_BATCH = 8192;
const TEMPERATURE_ANALYSIS = 0.2;
const TEMPERATURE_PLAN_DEFAULT = 0.8;
const BATCH_SIZE = 20;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiWithRetry(
  ai: GoogleGenAI,
  params: { model: string; contents: any; config: any },
  maxAttempts = 5
): Promise<any> {
  let attempts = 0;
  let currentDelay = 4000;
  while (attempts < maxAttempts) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      attempts++;
      const msg = (error.message || "").toLowerCase();
      const isOverloaded = msg.includes("503") || msg.includes("overloaded") || error.status === 503;
      const isRateLimit = msg.includes("429") || error.status === 429;
      if ((isOverloaded || isRateLimit) && attempts < maxAttempts) {
        await delay(currentDelay);
        currentDelay *= 2;
      } else {
        throw new Error("El servicio de IA está saturado o no disponible. Espera 1 minuto y reintenta.");
      }
    }
  }
  throw new Error("No se pudo conectar con el servicio de IA tras varios intentos.");
}

function parseJsonResponse(raw: string): any {
  let s = (raw || "").trim();
  s = s.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return JSON.parse(s);
}

export async function analyzeScriptGlobally(
  segments: ScriptSegment[],
  apiKey: string,
  projectContext?: string
): Promise<GlobalContext> {
  const ai = new GoogleGenAI({ apiKey });
  const fullScript = segments.map((s) => s.originalText).join("\n\n");
  const notes = segments.flatMap((s) => s.notes).filter(Boolean).join(" | ");
  const links = segments.flatMap((s) => s.extractedLinks).map((l) => `[${l.type}] ${l.url}`).join(" | ");

  const systemInstruction = `You are an expert script analyst for video production. Extract compact structured metadata. Be precise and literal. Only return entities explicitly in the script. If the script is in Spanish, output values in Spanish. Return valid JSON only. No commentary.`;

  const userPrompt = `${projectContext ? `USER-PROVIDED PROJECT BRIEF:\n${projectContext}\n\n` : ""}FULL SCRIPT:\n"""\n${fullScript}\n"""${notes ? `\nEDITORIAL NOTES: ${notes}` : ""}${links ? `\nLINKS: ${links}` : ""}\n\nExtract the structured metadata.`;

  const result = await callGeminiWithRetry(ai, {
    model: MODEL_NAME,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction,
      temperature: TEMPERATURE_ANALYSIS,
      maxOutputTokens: MAX_OUTPUT_TOKENS_ANALYSIS,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          genre: { type: Type.STRING },
          era: { type: Type.STRING },
          mainEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
          characters: { type: Type.ARRAY, items: { type: Type.STRING } },
          locations: { type: Type.ARRAY, items: { type: Type.STRING } },
          detectedTone: { type: Type.STRING },
          detectedStyle: { type: Type.STRING },
          keyTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["topic","genre","era","mainEntities","characters","locations","detectedTone","detectedStyle","keyTerms"],
      },
    },
  });

  const text = result?.text;
  if (!text) throw new Error("El análisis global del guion no devolvió respuesta.");
  try {
    return parseJsonResponse(text) as GlobalContext;
  } catch (e) {
    throw new Error("El análisis global devolvió un formato inesperado.");
  }
}

const BROLL_ITEM_SCHEMA = {
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
        variants: { type: Type.ARRAY, items: { type: Type.STRING } },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["mainQuery", "youtubeQuery", "keywords", "variants"],
    },
    styleParams: {
      type: Type.OBJECT,
      properties: {
        mood: { type: Type.STRING },
        style: { type: Type.STRING },
        negativePrompt: { type: Type.STRING },
      },
      required: ["mood", "style"],
    },
    aiPrompt: { type: Type.STRING },
  },
  required: ["segmentId","visualIntent","mediaType","searchQuery","styleParams"],
};

async function generateBatchPlan(
  ai: GoogleGenAI,
  batch: ScriptSegment[],
  systemInstruction: string,
  customStyle?: CustomStyle
): Promise<any[]> {
  const batchPayload = batch.map((s) => ({
    id: s.id,
    text: s.originalText,
    notes: s.notes.join("; "),
    hintLinks: s.extractedLinks.map((l) => `[${l.type}] ${l.url}`).join("; "),
  }));

  const promptText = `${customStyle ? `Apply custom style: ${customStyle.name}\n\n` : ""}Produce ONE B-roll suggestion for EACH of the following ${batch.length} segments. Return exactly ${batch.length} items in the same order:\n${JSON.stringify(batchPayload, null, 2)}`;

  const contents: any[] = [];
  if (customStyle?.imageReference) {
    const match = customStyle.imageReference.match(/^data:(image\/\w+);base64,(.*)$/);
    if (match) {
      contents.push({ role: "user", parts: [{ text: promptText }, { inlineData: { mimeType: match[1], data: match[2] } }] });
    } else {
      contents.push({ role: "user", parts: [{ text: promptText }] });
    }
  } else {
    contents.push({ role: "user", parts: [{ text: promptText }] });
  }

  const response = await callGeminiWithRetry(ai, {
    model: MODEL_NAME,
    contents,
    config: {
      systemInstruction,
      temperature: TEMPERATURE_PLAN_DEFAULT,
      maxOutputTokens: MAX_OUTPUT_TOKENS_BATCH,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: { type: Type.ARRAY, items: BROLL_ITEM_SCHEMA },
        },
        required: ["suggestions"],
      },
    },
  });

  const jsonString = response?.text;
  if (!jsonString) throw new Error("Lote sin respuesta de Gemini.");

  try {
    const parsed = parseJsonResponse(jsonString);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.suggestions)) return parsed.suggestions;
    if (Array.isArray(parsed?.items)) return parsed.items;
    throw new Error("No se encontró array en la respuesta del lote.");
  } catch (e) {
    console.error("Batch JSON error:", jsonString);
    throw new Error("La IA devolvió JSON malformado en un lote. Reintenta la generación.");
  }
}

export const generateBrollPlan = async (
  segments: ScriptSegment[],
  apiKey: string,
  userStyle: string = "Auto-Detect",
  userTone: string = "Auto-Detect",
  aspectRatio: string = "16:9",
  resolution: string = "4k",
  customStyle?: CustomStyle,
  projectContext?: string,
  onProgress?: (
    step: "analyzing" | "generating",
    context?: GlobalContext,
    batchNum?: number,
    totalBatches?: number
  ) => void
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey });

  onProgress?.("analyzing");
  const globalContext = await analyzeScriptGlobally(segments, apiKey, projectContext);

  const isAutoStyle = userStyle === "Auto-Detect";
  const isAutoTone = userTone === "Auto-Detect";
  const styleInstruction = customStyle
    ? `CUSTOM USER STYLE: ${customStyle.instruction}`
    : isAutoStyle ? `Use detected style: ${globalContext.detectedStyle}` : userStyle;
  const toneInstruction = isAutoTone ? `Use detected tone: ${globalContext.detectedTone}` : userTone;

  const SYSTEM_INSTRUCTION = `
You are an Elite Visual Director for documentary and commercial video production.

====================================================
LOCKED PROJECT CONTEXT (NEVER CONTRADICT. NEVER IGNORE.)
====================================================
Topic: ${globalContext.topic}
Genre: ${globalContext.genre}
Era: ${globalContext.era}
Main entities: ${globalContext.mainEntities.join(", ") || "N/A"}
Characters: ${globalContext.characters.join(", ") || "N/A"}
Locations: ${globalContext.locations.join(", ") || "N/A"}
Detected tone: ${globalContext.detectedTone}
Detected style: ${globalContext.detectedStyle}
Key vocabulary: ${globalContext.keyTerms.join(", ") || "N/A"}
${projectContext ? `\nUSER PROJECT BRIEF: ${projectContext}` : ""}

====================================================
MANDATORY RULES
====================================================
1. Every suggestion must reference at least one locked entity, character, location or key term.
2. No generic metaphors disconnected from the topic.
3. Subject consistency: visuals must match the locked topic and era.

====================================================
SEARCH QUERY ENGINEERING
====================================================
mainQuery: 2-5 concrete keywords for stock sites. NOT a full sentence.
  Good: "Chris Cornell live 1994"  Bad: "A cinematic shot of Chris Cornell"
youtubeQuery: optimized for YouTube, use "archival footage", "live performance", "documentary clip".
variants: 2-3 alternative mainQuery formulations.
keywords: 4-8 standalone tags.

====================================================
VISUAL STYLE
====================================================
Style: ${styleInstruction}
Tone: ${toneInstruction}
Aspect ratio: ${aspectRatio} | Resolution: ${resolution}

When mediaType is VIDEO, aiPrompt must specify camera movement, lens, lighting, and include "Aspect ratio ${aspectRatio}, ${resolution}, cinematic".
`.trim();

  const batches: ScriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }

  const allRawItems: any[] = [];
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    onProgress?.("generating", globalContext, batchIdx + 1, batches.length);
    const batchResult = await generateBatchPlan(ai, batches[batchIdx], SYSTEM_INSTRUCTION, customStyle);
    allRawItems.push(...batchResult);
  }

  const suggestionsById = new Map<string, any>(
    allRawItems.filter((i) => i && typeof i.segmentId === "string").map((i) => [i.segmentId, i])
  );

  return segments
    .map((seg) => {
      const item = suggestionsById.get(seg.id);
      if (!item) return null;
      const searchQuery = item.searchQuery || {};
      const mainQuery = searchQuery.mainQuery || item.visualIntent || "stock footage";
      const youtubeQuery = searchQuery.youtubeQuery || mainQuery + " footage";
      const queryEncoded = encodeURIComponent(mainQuery);
      const ytQueryEncoded = encodeURIComponent(youtubeQuery);
      const mediaType = item.mediaType === "VIDEO" ? "VIDEO" : "IMAGE";
      return {
        ...item,
        mediaType,
        searchQuery: {
          mainQuery,
          youtubeQuery,
          variants: searchQuery.variants || [],
          keywords: searchQuery.keywords || [],
        },
        styleParams: item.styleParams || { mood: userTone, style: userStyle },
        sources: {
          googleImages: `https://www.google.com/search?tbm=isch&q=${queryEncoded}`,
          pexels: `https://www.pexels.com/search/${mediaType === "VIDEO" ? "videos/" : ""}${queryEncoded}`,
          unsplash: `https://unsplash.com/s/photos/${queryEncoded}`,
          pinterest: `https://www.pinterest.com/search/pins/?q=${queryEncoded}`,
          youtube: `https://www.youtube.com/results?search_query=${ytQueryEncoded}`,
        },
      } as BrollSuggestion;
    })
    .filter((x): x is BrollSuggestion => x !== null);
};
