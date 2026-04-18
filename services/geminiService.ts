import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, CustomStyle, GlobalContext } from "../types";

// Phase 0.1: Use the latest stable Gemini 2.5 Flash model.
// The previous ID "gemini-3-flash-preview" was not a valid published model
// and could be silently resolving to an unintended fallback.
const MODEL_NAME = "gemini-2.5-flash";

// Generation limits. Gemini 2.5 Flash supports large outputs; we allow
// enough headroom for long scripts (~150 segments worth of JSON).
const MAX_OUTPUT_TOKENS_ANALYSIS = 2048;
const MAX_OUTPUT_TOKENS_PLAN = 32768;
const TEMPERATURE_ANALYSIS = 0.2; // Precise/literal extraction
const TEMPERATURE_PLAN_DEFAULT = 0.8; // More creative for visual ideation

// Helper for waiting/backoff
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shared retry wrapper for Gemini calls. Handles 503 overload + 429 rate limit
 * with exponential backoff. Non-recoverable errors are surfaced immediately.
 */
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
      console.warn(`Gemini API attempt ${attempts} failed:`, error);

      const msg = (error.message || "").toLowerCase();
      const isOverloaded =
        msg.includes("503") ||
        msg.includes("overloaded") ||
        error.status === 503 ||
        error.code === 503;
      const isRateLimit =
        msg.includes("429") || error.status === 429 || error.code === 429;

      if ((isOverloaded || isRateLimit) && attempts < maxAttempts) {
        console.log(
          `Model busy. Retry in ${currentDelay}ms (attempt ${attempts}/${maxAttempts})`
        );
        await delay(currentDelay);
        currentDelay *= 2;
      } else {
        console.error("Gemini API fatal error:", error);
        throw new Error(
          "El servicio de IA está saturado o no disponible. Espera 1 minuto y reintenta."
        );
      }
    }
  }
  throw new Error(
    "No se pudo conectar con el servicio de IA tras varios intentos."
  );
}

/**
 * Safely parse a JSON response coming from Gemini. The model is configured
 * with responseMimeType=application/json + responseSchema, so it should be
 * clean JSON — but we defensively strip markdown fences just in case.
 */
function parseJsonResponse(raw: string): any {
  let s = (raw || "").trim();
  // Strip ```json ... ``` or ``` ... ``` wrappers if present.
  s = s.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return JSON.parse(s);
}

/**
 * PHASE 1 — STEP 1: Global script analysis.
 * Extracts locked metadata (topic, entities, era, tone, etc.) that will be
 * injected as an anchor into Step 2. This is what prevents generic/out-of-context
 * visual suggestions.
 */
export async function analyzeScriptGlobally(
  segments: ScriptSegment[],
  apiKey: string,
  projectContext?: string
): Promise<GlobalContext> {
  const ai = new GoogleGenAI({ apiKey });

  const fullScript = segments.map((s) => s.originalText).join("\n\n");
  // Collect all user-provided bracket notes; these are often editorial cues.
  const notes = segments
    .flatMap((s) => s.notes)
    .filter(Boolean)
    .join(" | ");
  // Collect extracted URLs as additional grounding hints.
  const links = segments
    .flatMap((s) => s.extractedLinks)
    .map((l) => `[${l.type}] ${l.url}`)
    .join(" | ");

  const systemInstruction = `
You are an expert script analyst for video production.
Your only task: read a complete script once and extract a compact structured metadata block.
Rules:
- Be precise and literal. Only return entities that are explicitly in the script or unambiguously implied.
- Prefer proper nouns (names, bands, albums, places, events) over generic words.
- If the script is in Spanish, your output values must stay in Spanish (keep proper nouns as they appear).
- If a field truly does not apply, return an empty array or "N/A".
Return valid JSON matching the schema. No commentary.
`.trim();

  const userPrompt = `
${projectContext ? `USER-PROVIDED PROJECT BRIEF:\n${projectContext}\n\n` : ""}FULL SCRIPT:
"""
${fullScript}
"""
${notes ? `\nEDITORIAL NOTES FOUND IN BRACKETS: ${notes}` : ""}${links ? `\nLINKS FOUND IN THE SCRIPT: ${links}` : ""}

Now extract the structured metadata.
`;

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
          topic: {
            type: Type.STRING,
            description: "Main subject of the video in one short sentence.",
          },
          genre: {
            type: Type.STRING,
            description:
              "Video genre: music documentary, history essay, commercial, tutorial, etc.",
          },
          era: {
            type: Type.STRING,
            description:
              "Dominant time period of the story, e.g., '1990s Seattle grunge scene'. 'N/A' if not applicable.",
          },
          mainEntities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Key proper nouns: people, bands, albums, brands, works, events.",
          },
          characters: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "People explicitly mentioned or implied.",
          },
          locations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Places explicitly mentioned or implied.",
          },
          detectedTone: {
            type: Type.STRING,
            description:
              "Narrative tone of the script (informative, emotional, suspenseful, etc.).",
          },
          detectedStyle: {
            type: Type.STRING,
            description:
              "Appropriate visual style given the script content (cinematic, documentary, vintage, etc.).",
          },
          keyTerms: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Domain-specific vocabulary from the script that must appear in search queries where relevant.",
          },
        },
        required: [
          "topic",
          "genre",
          "era",
          "mainEntities",
          "characters",
          "locations",
          "detectedTone",
          "detectedStyle",
          "keyTerms",
        ],
      },
    },
  });

  const text = result?.text;
  if (!text) {
    throw new Error(
      "El análisis global del guion no devolvió respuesta. Reintenta en unos segundos."
    );
  }

  try {
    return parseJsonResponse(text) as GlobalContext;
  } catch (e) {
    console.error("Failed to parse global context JSON:", text);
    throw new Error("El análisis global devolvió JSON malformado.");
  }
}

/**
 * PHASE 1 — STEP 2: Generate per-segment B-roll suggestions,
 * anchored to the locked GlobalContext from Step 1.
 */
export const generateBrollPlan = async (
  segments: ScriptSegment[],
  apiKey: string,
  userStyle: string = "Auto-Detect",
  userTone: string = "Auto-Detect",
  aspectRatio: string = "16:9",
  resolution: string = "4k",
  customStyle?: CustomStyle,
  projectContext?: string
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey });

  // --- STEP 1: Global analysis (locked anchor) ---
  const globalContext = await analyzeScriptGlobally(
    segments,
    apiKey,
    projectContext
  );
  console.log("Global context derived:", globalContext);

  // --- STEP 2: Per-segment generation ---
  const isAutoStyle = userStyle === "Auto-Detect";
  const isAutoTone = userTone === "Auto-Detect";

  const styleInstruction = customStyle
    ? `CUSTOM USER STYLE: ${customStyle.instruction}`
    : isAutoStyle
    ? `Use the detected style: ${globalContext.detectedStyle}`
    : userStyle;

  const toneInstruction = isAutoTone
    ? `Use the detected tone: ${globalContext.detectedTone}`
    : userTone;

  const SYSTEM_INSTRUCTION = `
You are an Elite Visual Director for high-end documentary and commercial video production.
You are NOT a generic stock searcher. You are a CONTEXTUAL RESEARCHER.

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
${projectContext ? `\nUSER-PROVIDED PROJECT BRIEF: ${projectContext}` : ""}

====================================================
MANDATORY RULES
====================================================
1. EVERY suggestion must reference at least one LOCKED entity, character, location, or key term when the segment relates to it. Generic visuals are forbidden unless the segment is explicitly abstract.
2. NO generic metaphors: if a segment says "everything changed" and the topic is "${globalContext.topic}", do NOT suggest "a man looking at sunrise". Suggest something tied to the topic.
3. SUBJECT CONSISTENCY: even when the segment text is short, the visual must be consistent with the locked topic and era.
4. When text is ambiguous, infer intent from neighboring segments and the locked context.

====================================================
SEARCH QUERY ENGINEERING
====================================================
- 'mainQuery' = optimized for stock sites (Pexels, Unsplash, Pinterest, Google Images).
  It must be 2-5 CONCRETE keywords. NOT a full sentence. Include the subject + one strong modifier.
  Good: "Chris Cornell live 1994", "vintage grunge concert crowd"
  Bad: "A beautiful cinematic shot of Chris Cornell performing live"
- 'youtubeQuery' = optimized for YouTube. Longer is OK. Use terms like
  "archival footage", "live performance", "interview", "documentary clip", "news report", "music video".
  Example: "Soundgarden Black Hole Sun live 1994 archival footage"
- 'variants' = 2-3 alternative formulations of mainQuery.
- 'keywords' = 4-8 standalone tags (no phrases).

====================================================
VISUAL STYLE / TONE
====================================================
Visual style: ${styleInstruction}
Narrative tone: ${toneInstruction}
Aspect ratio: ${aspectRatio}
Resolution: ${resolution}

====================================================
VIDEO PROMPT ENGINEERING (for 'aiPrompt')
====================================================
When mediaType is VIDEO, the 'aiPrompt' must be production-ready:
- Camera movement (dolly, pan, truck, handheld).
- Lens (35mm, anamorphic, macro).
- Lighting (Rembrandt, neon, natural, golden hour).
- Action + subject grounded in the LOCKED entities when possible.
- Always include: "Aspect ratio ${aspectRatio}, ${resolution}, cinematic".

====================================================
OUTPUT
====================================================
Return a valid JSON array. One object per input segment. Match each object's 'segmentId' to the input 'id'. Do not skip segments.
`.trim();

  // Build payload: include notes and extractedLinks as hints to the model.
  const segmentsPayload = segments.map((s) => ({
    id: s.id,
    text: s.originalText,
    notes: s.notes.join("; "),
    hintLinks: s.extractedLinks
      .map((l) => `[${l.type}] ${l.url}`)
      .join("; "),
  }));

  const fullScriptForContext = segments.map((s) => s.originalText).join("\n\n");

  const promptText = `
${customStyle ? `Apply custom style: ${customStyle.name}` : ""}

FULL SCRIPT (for local-context windowing — read for coherence, do not re-analyze):
"""
${fullScriptForContext}
"""

Now produce ONE B-roll suggestion for EACH of these segments. Return exactly ${segments.length} items, one per id, in the same order:
${JSON.stringify(segmentsPayload)}
`;

  const contents: any[] = [];

  if (customStyle?.imageReference) {
    const match = customStyle.imageReference.match(
      /^data:(image\/\w+);base64,(.*)$/
    );
    if (match) {
      contents.push({
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType: match[1], data: match[2] } },
        ],
      });
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
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: TEMPERATURE_PLAN_DEFAULT,
      maxOutputTokens: MAX_OUTPUT_TOKENS_PLAN,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            segmentId: { type: Type.STRING },
            visualIntent: {
              type: Type.STRING,
              description:
                "Specific shot description anchored to the locked context.",
            },
            mediaType: { type: Type.STRING, enum: ["VIDEO", "IMAGE"] },
            searchQuery: {
              type: Type.OBJECT,
              properties: {
                mainQuery: {
                  type: Type.STRING,
                  description:
                    "2-5 concrete keywords for stock sites (NOT a full sentence).",
                },
                youtubeQuery: {
                  type: Type.STRING,
                  description:
                    "YouTube-optimized query with terms like 'archival footage', 'live performance', 'documentary clip'.",
                },
                variants: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                keywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
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
            aiPrompt: {
              type: Type.STRING,
              description:
                "Production-ready generative-video prompt. Include camera, lens, lighting, aspect ratio and resolution.",
            },
          },
          required: [
            "segmentId",
            "visualIntent",
            "mediaType",
            "searchQuery",
            "styleParams",
          ],
        },
      },
    },
  });

  const jsonString = response?.text;
  if (!jsonString) {
    throw new Error("No response from Gemini");
  }

  let rawData: any[];
  try {
    rawData = parseJsonResponse(jsonString);
  } catch (e) {
    console.error("Failed to parse JSON", jsonString);
    throw new Error(
      "La IA devolvió JSON malformado. Es posible que la respuesta se haya truncado; intenta con un guion más corto o regenera."
    );
  }

  if (!Array.isArray(rawData)) {
    throw new Error("La IA devolvió un formato inesperado (no es un array).");
  }

  // Phase 0.3: Coverage validation.
  const suggestionsById = new Map<string, any>(
    rawData
      .filter((i) => i && typeof i.segmentId === "string")
      .map((i) => [i.segmentId, i])
  );
  const missing = segments.filter((s) => !suggestionsById.has(s.id));
  if (missing.length > 0) {
    console.warn(
      `[Coverage] ${missing.length}/${segments.length} segments missing a suggestion. Missing IDs:`,
      missing.map((m) => m.id)
    );
  } else {
    console.info(
      `[Coverage] 100% — ${segments.length}/${segments.length} segments mapped.`
    );
  }

  // Map to BrollSuggestion in original segment order.
  return segments
    .map((seg) => {
      const item = suggestionsById.get(seg.id);
      if (!item) return null;

      const searchQuery = item.searchQuery || {};
      const mainQuery =
        searchQuery.mainQuery || item.visualIntent || "stock footage";
      const youtubeQuery =
        searchQuery.youtubeQuery || mainQuery + " footage";
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
        styleParams: item.styleParams || {
          mood: userTone,
          style: userStyle,
        },
        sources: {
          googleImages: `https://www.google.com/search?tbm=isch&q=${queryEncoded}`,
          pexels: `https://www.pexels.com/search/${
            mediaType === "VIDEO" ? "videos/" : ""
          }${queryEncoded}`,
          unsplash: `https://unsplash.com/s/photos/${queryEncoded}`,
          pinterest: `https://www.pinterest.com/search/pins/?q=${queryEncoded}`,
          youtube: `https://www.youtube.com/results?search_query=${ytQueryEncoded}`,
        },
      } as BrollSuggestion;
    })
    .filter((x): x is BrollSuggestion => x !== null);
};
