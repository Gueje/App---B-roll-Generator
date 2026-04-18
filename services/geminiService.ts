import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType, CustomStyle } from "../types";

const MODEL_NAME = "gemini-3-flash-preview"; 

// Helper for waiting/backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateBrollPlan = async (
  segments: ScriptSegment[],
  apiKey: string,
  userStyle: string = "Auto-Detect",
  userTone: string = "Auto-Detect",
  aspectRatio: string = "16:9",
  resolution: string = "4k",
  customStyle?: CustomStyle
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // If Auto-Detect is selected, we instruction the model to perform analysis first.
  const isAutoStyle = userStyle === "Auto-Detect";
  const isAutoTone = userTone === "Auto-Detect";

  const styleInstruction = customStyle 
    ? `USE THIS CUSTOM STYLE INSTRUCTION: ${customStyle.instruction}` 
    : (isAutoStyle ? "YOU MUST DECIDE THE BEST STYLE based on the script content." : userStyle);

  const SYSTEM_INSTRUCTION = `
    You are an Elite Visual Director for high-end documentary and commercial video production. 
    You are NOT a basic stock searcher. You are a CONTEXTUAL RESEARCHER.

    **GLOBAL OBJECTIVE:**
    Analyze the ENTIRE SCRIPT to understand the specific subject matter (e.g., "The History of Bitcoin", "Climate Change in 2024", "A specific Wedding").
    
    **STRICTNESS RULES (CRITICAL):**
    1. **NO GENERIC METAPHORS:** If the script says "It changed everything" in the context of Bitcoin, DO NOT suggest a "man looking at sunrise". Suggest "Bitcoin price chart skyrocketing on a monitor".
    2. **SUBJECT CONSISTENCY:** Every single visual suggestion MUST contain the main subject of the script. If the script is about dogs, do not show a generic "happy family" unless a dog is present.
    3. **CONTEXT IS KING:** Look at the surrounding segments. If Segment 1 mentions "1980s", Segment 2 must visually reflect the 1980s even if the text doesn't explicitly say "1980s".

    **USER CONFIGURATION:**
    - **Visual Style:** ${styleInstruction}
    - **Narrative Tone:** ${isAutoTone ? "YOU MUST DECIDE THE BEST TONE based on the script content." : userTone}
    - **Aspect Ratio:** ${aspectRatio}
    - **Resolution:** ${resolution}

    **YOUTUBE SEARCH LOGIC:**
    - You must generate a specific 'youtubeQuery'.
    - YouTube queries are different from Stock queries.
    - Stock: "Bitcoin golden coin on table"
    - YouTube: "Bitcoin history documentary footage 2009", "Satoshi Nakamoto explained clip", "News anchor talking about Bitcoin crash".
    - Use terms like: "documentary clip", "archival footage", "interview", "news report", "scene", "gameplay" (if gaming).

    **VIDEO PROMPT ENGINEERING (HOLLYWOOD STANDARD):**
    - If Media Type is VIDEO, the 'aiPrompt' must be production-ready.
    - Include: Camera Movement (Dolly, Pan, Truck), Lens (35mm, Anamorphic), Lighting (Rembrandt, Neon, Natural), and Action.
    - IMPORTANT: Always include the Aspect Ratio (${aspectRatio}) and Resolution (${resolution}) in the 'aiPrompt'.
    - If a reference image is provided, replicate its style, density, and texture exactly in the 'aiPrompt'.
    - Example: "Close-up of a vintage computer monitor displaying green code. Slow dolly in. Dusty room, shaft of sunlight hitting the screen. Aspect Ratio ${aspectRatio}, Resolution ${resolution}, cinematic."

    **OUTPUT STRUCTURE (JSON):**
    Return a valid JSON array where each object corresponds to a segment.
    CRITICAL: You MUST return EXACTLY ONE object for EVERY input segment provided. Do NOT skip any segments.
  `;

  // CHUNKING LOGIC: Break segments into batches of 15 to ensure total coverage and avoid token exhaustion
  const CHUNK_SIZE = 12;
  const chunkedSegments: ScriptSegment[][] = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    chunkedSegments.push(segments.slice(i, i + CHUNK_SIZE));
  }

  const allRawData: any[] = [];

  for (const chunk of chunkedSegments) {
    const segmentsPayload = chunk.map(s => ({
      id: s.id,
      text: s.originalText,
      notes: s.notes.join("; ")
    }));

    const promptText = `
      Analyze these script segments.
      ${customStyle ? `Apply custom style: ${customStyle.name}` : (isAutoStyle ? "Determine the best visual style yourself." : `Apply style: ${userStyle}`)}
      ${isAutoTone ? "Determine the best tone yourself." : `Apply tone: ${userTone}`}
      
      Input Segments (Batch):
      ${JSON.stringify(segmentsPayload)}
    `;

    const contents: any[] = [];
    
    if (customStyle?.imageReference) {
      // Extract base64 and mime type
      const match = customStyle.imageReference.match(/^data:(image\/\w+);base64,(.*)$/);
      if (match) {
        contents.push({
          role: "user",
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: match[1],
                data: match[2]
              }
            }
          ]
        });
      } else {
        contents.push({ role: "user", parts: [{ text: promptText }] });
      }
    } else {
      contents.push({ role: "user", parts: [{ text: promptText }] });
    }

    let response;
    let attempts = 0;
    const maxAttempts = 5; 
    let currentDelay = 4000; 

    // Retry Loop for this specific chunk
    while (attempts < maxAttempts) {
      try {
        const result = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  segmentId: { type: Type.STRING },
                  visualIntent: { type: Type.STRING, description: "Detailed description of the specific shot relating to the script context" },
                  mediaType: { type: Type.STRING, enum: ["VIDEO", "IMAGE"] },
                  searchQuery: {
                    type: Type.OBJECT,
                    properties: {
                      mainQuery: { type: Type.STRING, description: "Stock site optimized query (subject + action)" },
                      youtubeQuery: { type: Type.STRING, description: "YouTube optimized query (topic + 'footage'/'clip'/'documentary')" },
                      variants: { type: Type.ARRAY, items: { type: Type.STRING } },
                      keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ["mainQuery", "youtubeQuery", "keywords", "variants"]
                  },
                  styleParams: {
                    type: Type.OBJECT,
                    properties: {
                      mood: { type: Type.STRING },
                      style: { type: Type.STRING },
                      negativePrompt: { type: Type.STRING }
                    },
                    required: ["mood", "style"]
                  },
                  aiPrompt: { type: Type.STRING, description: "Extremely detailed technical prompt for GenAI video" }
                },
                required: ["segmentId", "visualIntent", "mediaType", "searchQuery", "styleParams"]
              }
            }
          }
        });
        
        response = result;
        break;

      } catch (error: any) {
        attempts++;
        console.warn(`Gemini API chunk attempt ${attempts} failed:`, error);
        
        const errorMessage = error.message?.toLowerCase() || '';
        const isOverloaded = errorMessage.includes('503') || errorMessage.includes('overloaded') || error.status === 503 || error.code === 503;
        const isRateLimit = errorMessage.includes('429') || error.status === 429 || error.code === 429;

        if ((isOverloaded || isRateLimit) && attempts < maxAttempts) {
            await delay(currentDelay);
            currentDelay *= 2;
        } else {
            throw new Error(`Error en el servicio de IA al procesar un bloque largo: ${error.message}`);
        }
      }
    }

    if (!response || !response.text) {
        throw new Error("No se recibió respuesta válida de la IA para un segmento del documento.");
    }

    let jsonString = response.text.trim();
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.replace(/^```json/, "").replace(/```$/, "");
    } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.replace(/^```/, "").replace(/```$/, "");
    }

    try {
        const chunkData = JSON.parse(jsonString);
        if (Array.isArray(chunkData)) {
            allRawData.push(...chunkData);
        }
    } catch (e) {
        console.error("Failed to parse chunk JSON", jsonString);
        // We continue hoping other chunks succeed, or maybe we should throw. 
        // For robustness, if a chunk fails, we'll have missing IDs and the fallback will catch it.
    }
  }

  return segments.map((segment) => {
    const item = allRawData.find((r: any) => String(r.segmentId) === String(segment.id));
    
    const searchQuery = item?.searchQuery || {};
    const mainQuery = searchQuery.mainQuery || item?.visualIntent || segment.originalText.substring(0, 60) || "stock footage";
    const youtubeQuery = searchQuery.youtubeQuery || mainQuery + " footage";
    
    const queryEncoded = encodeURIComponent(mainQuery);
    const ytQueryEncoded = encodeURIComponent(youtubeQuery);
    
    const mediaType = item?.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';

    return {
      segmentId: segment.id,
      visualIntent: item?.visualIntent || `Visual representativo de: ${segment.originalText.substring(0, 50)}...`,
      mediaType,
      searchQuery: {
          mainQuery: mainQuery,
          youtubeQuery: youtubeQuery,
          variants: searchQuery.variants || [],
          keywords: searchQuery.keywords || []
      },
      styleParams: item?.styleParams || { mood: userTone, style: userStyle },
      aiPrompt: item?.aiPrompt || `${mainQuery}. Cinematic, 4k, aspect ratio ${aspectRatio}.`,
      sources: {
        googleImages: `https://www.google.com/search?tbm=isch&q=${queryEncoded}`,
        pexels: `https://www.pexels.com/search/${mediaType === 'VIDEO' ? 'videos/' : ''}${queryEncoded}`,
        unsplash: `https://unsplash.com/s/photos/${queryEncoded}`,
        pinterest: `https://www.pinterest.com/search/pins/?q=${queryEncoded}`,
        youtube: `https://www.youtube.com/results?search_query=${ytQueryEncoded}`
      }
    } as BrollSuggestion;
  });
};