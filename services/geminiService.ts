import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType, CustomStyle } from "../types";

// Standard model names from skill definitions
const FLASH_MODEL = "gemini-3-flash-preview"; 
const PRO_MODEL = "gemini-3.1-pro-preview";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getGlobalContext = async (
  fullText: string,
  apiKey: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    Analyze this video script and provide a brief (max 2 lines) visual context.
    CRITICAL: Identify the EXACT main subject and the core visual style.
    Example: "A documentary about 'X' focusing on 'Y', using 'Z' visuals."
    
    SCRIPT:
    ${fullText.substring(0, 8000)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: prompt,
    });
    return response.text?.trim() || "Generic documentary style.";
  } catch (err) {
    console.error("Context analysis failed with Pro, falling back to Flash", err);
    try {
        const response = await ai.models.generateContent({
            model: FLASH_MODEL,
            contents: prompt,
        });
        return response.text?.trim() || "Generic documentary style.";
    } catch (innerErr) {
        return "Generic subject in professional style.";
    }
  }
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

  // Small chunk size ensures higher reliability and avoids token/timeout issues
  const CHUNK_SIZE = 8;
  const chunkedSegments = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    chunkedSegments.push(segments.slice(i, i + CHUNK_SIZE));
  }

  const allRawData: any[] = [];
  // Use provided context or fall back to deriving it
  const finalContext = providedContext || segments.slice(0, 3).map(s => s.originalText).join(" ");

  for (let i = 0; i < chunkedSegments.length; i++) {
    const chunk = chunkedSegments[i];
    // Continuity context from the previous few segments
    const prevContext = i > 0 ? segments.slice(Math.max(0, i * CHUNK_SIZE - 2), i * CHUNK_SIZE).map(s => s.originalText).join(" ") : "";
    
    const prompt = `
      CRITICAL ROLE: You are a high-end visual specialist.
      MASTER SUBJECT REFERENCE: "${finalContext}"
      ${prevContext ? `PREVIOUS NARRATIVE CONTEXT: "${prevContext}"` : ""}
      
      USER PREFERENCES:
      - Requested Style: ${customStyle ? customStyle.instruction : userStyle}
      - Narrative Tone: ${userTone}
      - Visual Specs: ${aspectRatio}, ${resolution}
      
      STRICT REQUIREMENT:
      For every segment below, you MUST generate a search query that is 100% SPECIFIC to the Master Subject Reference. 
      If the subject is missing from a query, the result is worthless.
      
      SEGMENTS TO PROCESS (KEEP IDs EXACT):
      ${JSON.stringify(chunk.map(s => ({ id: s.id, text: s.originalText })))}
    `;

    const systemInstruction = `You are a Professional Film Director and Visual Researcher. 
    Your mission is to provide RIGOROUS and contextually relevant visual plans for a script.
    
    STRICT RULES:
    1. SUBJECT RIGOR: Every 'mainQuery' and 'youtubeQuery' MUST include the specific subject of the script. NO generic metaphors.
    2. CONTEXTUAL ACCURACY: Analyze the theme and ensure every visual reinforces the specific topic.
    3. NO FILLER: DO NOT provide generic office/business shots unless explicitly required by context.
    4. DATA INTEGRITY: Return a valid JSON array matching the schema exactly.`;

    let attempts = 0;
    const maxAttempts = 5;
    let success = false;

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
        if (!text) throw new Error("Empty response from AI");
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          allRawData.push(...data);
          success = true;
          // Small breathing room between successful chunks to avoid spike demand errors
          await delay(800);
        }
      } catch (err: any) {
        attempts++;
        const isServerBusy = err.message?.includes("503") || err.message?.includes("overloaded");
        const pauseTime = isServerBusy ? 5000 * attempts : 2500 * attempts;
        
        console.error(`Chunk ${i} attempt ${attempts} failed. Rescheduling in ${pauseTime}ms...`, err.message);
        await delay(pauseTime); 
      }
    }
    
    if (!success) {
        console.warn(`Chunk ${i} permanently failed after ${maxAttempts} attempts. Skipping to maintain app stability.`);
    }
  }

  // Map results back to original segments with robust fallbacks
  return segments.map(segment => {
    const found = allRawData.find(r => String(r.segmentId) === String(segment.id));
    const mainQuery = found?.searchQuery?.mainQuery || segment.originalText.substring(0, 60);
    const ytQuery = found?.searchQuery?.youtubeQuery || mainQuery;
    
    return {
      segmentId: segment.id,
      visualIntent: found?.visualIntent || `Visual representativo de: ${segment.originalText.substring(0, 50)}...`,
      mediaType: found?.mediaType || "VIDEO",
      searchQuery: {
        mainQuery,
        youtubeQuery: ytQuery,
        variants: [],
        keywords: []
      },
      styleParams: { mood: userTone, style: userStyle },
      aiPrompt: found?.aiPrompt || `${mainQuery}, cinematic 4k, ${aspectRatio}`,
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
