import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

// Helper for waiting/backoff
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateBrollPlan = async (
  segments: ScriptSegment[],
  apiKey: string,
  userStyle: string = "Auto-Detect",
  userTone: string = "Auto-Detect"
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // If Auto-Detect is selected, we instruction the model to perform analysis first.
  const isAutoStyle = userStyle === "Auto-Detect";
  const isAutoTone = userTone === "Auto-Detect";

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
    - **Visual Style:** ${isAutoStyle ? "YOU MUST DECIDE THE BEST STYLE based on the script content." : userStyle}
    - **Narrative Tone:** ${isAutoTone ? "YOU MUST DECIDE THE BEST TONE based on the script content." : userTone}

    **YOUTUBE SEARCH LOGIC:**
    - You must generate a specific 'youtubeQuery'.
    - YouTube queries are different from Stock queries.
    - Stock: "Bitcoin golden coin on table"
    - YouTube: "Bitcoin history documentary footage 2009", "Satoshi Nakamoto explained clip", "News anchor talking about Bitcoin crash".
    - Use terms like: "documentary clip", "archival footage", "interview", "news report", "scene", "gameplay" (if gaming).

    **VIDEO PROMPT ENGINEERING (HOLLYWOOD STANDARD):**
    - If Media Type is VIDEO, the 'aiPrompt' must be production-ready.
    - Include: Camera Movement (Dolly, Pan, Truck), Lens (35mm, Anamorphic), Lighting (Rembrandt, Neon, Natural), and Action.
    - Example: "Close-up of a vintage computer monitor displaying green code. Slow dolly in. Dusty room, shaft of sunlight hitting the screen. 4k, cinematic."

    **OUTPUT STRUCTURE (JSON):**
    Return a valid JSON array where each object corresponds to a segment.
  `;

  // Processing payload
  const segmentsPayload = segments.map(s => ({
    id: s.id,
    text: s.originalText,
    notes: s.notes.join("; ")
  }));

  const prompt = `
    Analyze these script segments.
    ${isAutoStyle ? "Determine the best visual style yourself." : `Apply style: ${userStyle}`}
    ${isAutoTone ? "Determine the best tone yourself." : `Apply tone: ${userTone}`}
    
    Input Segments:
    ${JSON.stringify(segmentsPayload)}
  `;

  let response;
  let attempts = 0;
  const maxAttempts = 5; // Increased attempts due to high load
  let currentDelay = 4000; // Increased initial delay to 4 seconds

  // Retry Loop
  while (attempts < maxAttempts) {
    try {
      response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
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
      
      // Success! Exit loop.
      break;

    } catch (error: any) {
      attempts++;
      console.warn(`Gemini API attempt ${attempts} failed:`, error);
      
      const errorMessage = error.message?.toLowerCase() || '';
      
      // Robust check for overload/503
      const isOverloaded = 
        errorMessage.includes('503') || 
        errorMessage.includes('overloaded') ||
        error.status === 503 || 
        error.code === 503;

      const isRateLimit = 
        errorMessage.includes('429') || 
        error.status === 429 || 
        error.code === 429;

      if ((isOverloaded || isRateLimit) && attempts < maxAttempts) {
          console.log(`Model overloaded or busy. Retrying in ${currentDelay}ms... (Attempt ${attempts}/${maxAttempts})`);
          await delay(currentDelay);
          currentDelay *= 2; // Exponential backoff (4s -> 8s -> 16s -> 32s)
      } else {
          // If error is not recoverable or max attempts reached, throw it.
          console.error("Gemini API Fatal Error:", error);
          throw new Error("El servicio de IA está saturado (Error 503). Por favor espera 1 minuto y vuelve a intentarlo.");
      }
    }
  }

  if (!response) {
      throw new Error("No se pudo conectar con el servicio de IA tras varios intentos.");
  }

  let jsonString = response.text;
  if (!jsonString) {
    throw new Error("No response from Gemini");
  }

  // Clean up markdown
  jsonString = jsonString.trim();
  if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json/, "").replace(/```$/, "");
  } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```/, "").replace(/```$/, "");
  }

  let rawData;
  try {
      rawData = JSON.parse(jsonString);
  } catch (e) {
      console.error("Failed to parse JSON", jsonString);
      throw new Error("Received malformed JSON from API");
  }
  
  return rawData.map((item: any) => {
    const searchQuery = item.searchQuery || {};
    const mainQuery = searchQuery.mainQuery || item.visualIntent || "stock footage";
    const youtubeQuery = searchQuery.youtubeQuery || mainQuery + " footage";
    
    const queryEncoded = encodeURIComponent(mainQuery);
    const ytQueryEncoded = encodeURIComponent(youtubeQuery);
    
    const mediaType = item.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';

    return {
      ...item,
      mediaType,
      searchQuery: {
          mainQuery: mainQuery,
          youtubeQuery: youtubeQuery,
          variants: searchQuery.variants || [],
          keywords: searchQuery.keywords || []
      },
      styleParams: item.styleParams || { mood: userTone, style: userStyle },
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