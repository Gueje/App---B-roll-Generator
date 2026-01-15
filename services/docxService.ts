import mammoth from 'mammoth';
import { ScriptSegment, ExtractedLink } from '../types';

/**
 * Parses a .docx file buffer into structured script segments.
 */
export const parseDocx = async (arrayBuffer: ArrayBuffer): Promise<ScriptSegment[]> => {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    // Split logic: 
    // 1. Look for newlines (standard paragraphs) OR
    // 2. Look for sentence terminators (. ? !) followed by whitespace and a capital letter (start of new idea)
    // This regex creates a split on:
    // - Double newlines
    // - Single newlines
    // - Period/Question/Exclamation + Space + Lookahead for Uppercase or Start of sentence
    
    const splitRegex = /(?:\r?\n)+|(?<=[.!?])\s+(?=[A-Z¿¡])/;
    
    const rawSegments = text.split(splitRegex);
    const segments: ScriptSegment[] = [];
    
    let orderCounter = 0;

    // Regex for URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    rawSegments.forEach((raw) => {
      const trimmed = raw.trim();
      // Only keep segments that have actual content (more than just a symbol)
      if (trimmed.length > 2) {
        // Extract notes (text in brackets)
        const noteRegex = /\[(.*?)\]|\{(.*?)\}/g;
        const notes: string[] = [];
        let match;
        while ((match = noteRegex.exec(trimmed)) !== null) {
          if (match[1]) notes.push(match[1]);
          if (match[2]) notes.push(match[2]);
        }

        // Extract Links
        const extractedLinks: ExtractedLink[] = [];
        let linkMatch;
        while ((linkMatch = urlRegex.exec(trimmed)) !== null) {
          const url = linkMatch[0].replace(/[)]$/, ''); // Remove trailing parenthesis if caught
          let type: 'YOUTUBE' | 'IMAGE' | 'GENERIC' = 'GENERIC';
          
          if (url.includes('youtube.com') || url.includes('youtu.be')) {
            type = 'YOUTUBE';
          } else if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.includes('imgur') || url.includes('drive.google.com')) {
            type = 'IMAGE';
          }
          
          extractedLinks.push({ url, type });
        }

        // Clean text by removing notes for the main visual script
        const cleanText = trimmed.replace(noteRegex, '').trim();

        if (cleanText.length > 0 || notes.length > 0) {
          segments.push({
            id: `seg-${orderCounter}-${Date.now()}`,
            originalText: cleanText || "[Visual Note Only]",
            notes: notes,
            extractedLinks: extractedLinks,
            order: orderCounter++
          });
        }
      }
    });

    return segments;
  } catch (error) {
    console.error("Failed to parse DOCX", error);
    throw new Error("Failed to parse document. Please ensure it is a valid .docx file.");
  }
};