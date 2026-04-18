import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, CustomStyle, GlobalContext } from "../types";

// Use the stable Gemini 2.0 Flash model.
// gemini-2.0-flash is the proven stable release with reliable structured-output
// support on the free tier. gemini-2.5-flash is a preview/thinking model that
// can produce inconsistent JSON when responseSchema is used.
const MODEL_NAME = "gemini-2.0-flash";

// Token budgets
const MAX_OUTPUT_TOKENS_ANALYSIS = 2048;
// Per-batch budget: smaller window prevents truncation on long scripts.
const MAX_OUTPUT_TOKENS_BATCH = 8192;
const TEMPERATURE_ANALYSIS = 0.2;
const TEMPERATURE_PLAN_DEFAULT = 0.8;

// How many segments to send to Gemini in a single call.
// 20 keeps each batch well within the token budget even for verbose segments.
const BATCH_SIZE = 20;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shared retry wrapper for Gemini calls.
 * Handles 503 overload + 429 rate-limit with exponential backoff.
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
 * Safely parse a JSON response from Gemini.
 * Strips markdown code fences defensively even though we request application/json.
 */
function parseJsonResponse(raw: string): any {
  let s = (raw || "").trim();
  s = s.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return JSON.parse(s);
}

/**
 * STEP 1: Global script analysis.
 * Extracts locked metadata (topic, entities, era, tone…) that is injected as an
 * anchor into every Step 2 batch call. This is what prevents generic suggestions.
 */
export async function analyzeScriptGlobally(
  segments: ScriptSegment[],
  apiKey: string,
  projectContext?: string
): Promise<GlobalContext> {
  const ai = new GoogleGenAI({ apiKey });

  const fullScript = segments.map((s) => s.originalText).join("\n\n");
  const notes = segments
    .flatMap((s) => s.notes)
    .filter(Boolean)
    .join(" | ");
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
              "Dominant time period of the story. 'N/A' if not applicable.",
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
            description: "Narrative tone (informative, emotional, suspenseful…).",
          },
          detectedStyle: {
            type: Type.STRING,
            description:
              "Appropriate visual style (cinematic, documentary, vintage…).",
          },
          keyTerms: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Domain-specific vocabulary that must appear in search queries when relevant.",
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

// ─── Response schema reused for every batch ──────────────────────────────────
const BROLL_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    segmentId: { type: Type.STRING },
    visualIntent: {
      type: Type.STRING,
      description: "Specific shot description anchored to the locked context.",
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
};

/**
 * Internal helper: send one batch of segments to Gemini and return raw items.
 * The system instruction already carries the full GlobalContext anchor so we
 * do NOT re-send the full script here — that was the source of token bloat.
 */
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
    hintLinks: s.extractedLinks
      .map((l) => `[${l.type}] ${l.url}`)
      .join("; "),
  }));

  const promptText = `${customStyle ? `Apply custom style: ${customStyle.name}\n\n` : ""}Produce ONE B-roll suggestion for EACH of the following ${batch.length} segments.

Return ONLY a valid JSON array — no markdown, no explanation, no wrapper object.
Each element must match this structure exactly:
{"segmentId":"<id>","visualIntent":"<shot description>","mediaType":"VIDEO" or "IMAGE","searchQuery":{"mainQuery":"2-5 keywords","youtubeQuery":"youtube query","variants":["alt1","alt2"],"keywords":["tag1","tag2","tag3"]},"styleParams":{"mood":"<mood>","style":"<style>"},"aiPrompt":"<video prompt>"}

Segments to process (return exactly ${batch.length} items, same order):
${JSON.stringify(batchPayload, null, 2)}`;

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
      systemInstruction,
      temperature: TEMPERATURE_PLAN_DEFAULT,
      maxOutputTokens: MAX_OUTPUT_TOKENS_BATCH,
      responseMimeType: "application/json",
      // No responseSchema: the explicit JSON structure in the prompt text +
      // responseMimeType is enough and avoids schema-enforcement failures
      // that occur with different model versions and SDK configurations.
    },
  });

  const jsonString = response?.text;
  if (!jsonString) throw new Error("Batch returned empty response from Gemini.");

  try {
    const parsed = parseJsonResponse(jsonString);
    // Extract from the object wrapper, with graceful fallbacks.
    let arr: any[];
    if (Array.isArray(parsed)) {
      arr = parsed; // Defensive: model returned bare array despite schema
    } else if (Array.isArray(parsed?.suggestions)) {
      arr = parsed.suggestions;
    } else if (Array.isArray(parsed?.items)) {
      arr = parsed.items;
    } else {
      throw new Error("Could not locate array in batch response.");
    }
    return arr;
  } catch (e) {
    console.error("Failed to parse batch JSON:", jsonString);
    throw new Error(
      "La IA devolvió JSON malformado en un lote. Reintenta la generación."
    );
  }
}

/**
 * STEP 2: Generate per-segment B-roll suggestions in batches of BATCH_SIZE,
 * anchored to the GlobalContext produced by Step 1.
 *
 * @param onProgress  Optional callback fired at each phase transition.
 *                    step="analyzing"  → Step 1 in progress
 *                    step="generating" → Step 2 in progress (ctx + batch info provided)
 */
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

  // ── STEP 1: Global analysis ───────────────────────────────────────────────
  onProgress?.("analyzing");
  const globalContext = await analyzeScriptGlobally(
    segments,
    apiKey,
    projectContext
  );
  console.log("Global context derived:", globalContext);

  // ── Build system instruction (shared by all batches) ─────────────────────
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

  // ── STEP 2: Batched generation ────────────────────────────────────────────
  const batches: ScriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }

  const allRawItems: any[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    onProgress?.("generating", globalContext, batchIdx + 1, batches.length);
    console.log(
      `Generating batch ${batchIdx + 1}/${batches.length} (${batches[batchIdx].length} segments)`
    );
    const batchResult = await generateBatchPlan(
      ai,
      batches[batchIdx],
      SYSTEM_INSTRUCTION,
      customStyle
    );
    allRawItems.push(...batchResult);
  }

  // ── Phase 0.3: Coverage validation ───────────────────────────────────────
  const suggestionsById = new Map<string, any>(
    allRawItems
      .filter((i) => i && typeof i.segmentId === "string")
      .map((i) => [i.segmentId, i])
  );

  const missing = segments.filter((s) => !suggestionsById.has(s.id));
  if (missing.length > 0) {
    console.warn(
      `[Coverage] ${missing.length}/${segments.length} segments missing a suggestion. IDs:`,
      missing.map((m) => m.id)
    );
  } else {
    console.info(
      `[Coverage] 100% — ${segments.length}/${segments.length} segments mapped.`
    );
  }

  // ── Map to BrollSuggestion in original segment order ─────────────────────
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
        styleParams: item.styleParams || { mood: userTone, style: userStyle },
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
