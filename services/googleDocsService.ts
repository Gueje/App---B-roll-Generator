import { ScriptSegment, BrollSuggestion, ExportStats } from "../types";

/**
 * NOTE: This service uses the Google API Client Library (gapi) loaded in index.html.
 * It requires the user to provide a Client ID and API Key with scope 'https://www.googleapis.com/auth/documents'.
 */

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Helper to wait for GAPI
const waitForGapi = (): Promise<void> => {
  return new Promise((resolve) => {
    if (window.gapi && window.google) resolve();
    else {
      let interval = setInterval(() => {
        if (window.gapi && window.google) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    }
  });
};

export const initializeGoogleAuth = async (clientId: string, apiKey: string) => {
  await waitForGapi();
  return new Promise<void>((resolve, reject) => {
    window.gapi.load('client:auth2', async () => {
      try {
        await window.gapi.client.init({
          apiKey: apiKey,
          clientId: clientId,
          discoveryDocs: ["https://docs.googleapis.com/$discovery/rest?version=v1"],
          scope: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file",
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
};

export const signInToGoogle = async (): Promise<boolean> => {
  const authInstance = window.gapi.auth2.getAuthInstance();
  if (!authInstance.isSignedIn.get()) {
    await authInstance.signIn();
  }
  return authInstance.isSignedIn.get();
};

export const createBrollDoc = async (
  filename: string,
  segments: ScriptSegment[],
  suggestions: BrollSuggestion[]
): Promise<{ docUrl: string; stats: ExportStats }> => {
  
  // 1. Create the Doc
  const createResponse = await window.gapi.client.docs.documents.create({
    title: filename,
  });
  const docId = createResponse.result.documentId;

  // 2. Build requests
  const requests: any[] = [];
  let index = 1; // Start index (1-based usually, but API is 0-based index)

  // Insert Title
  requests.push({
    insertText: {
      location: { index: 1 },
      text: `B-ROLL PLAN: ${filename}\n\n`
    }
  });
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: 1, endIndex: 1 + `B-ROLL PLAN: ${filename}`.length },
      paragraphStyle: { namedStyleType: 'HEADING_1' },
      fields: 'namedStyleType'
    }
  });

  // Calculate current index roughly (gapi docs batch update handles offsets automatically if ordered backward, 
  // but to be safe usually we calculate. For simplicity here, we assume sequential append at end is tricky without tracking index.
  // Actually, easiest way is to insert text at the end using `endOfSegmentLocation` if available, or just track length.
  // Since we have to map exact indices, we will build the document in REVERSE order (bottom up) so indices don't shift 
  // OR calculate exact lengths. Let's do calculation.)
  
  // Actually, simpler strategy: Build a huge text string, insert it once, then apply styling. 
  // BUT we need hyperlinks. So we must use requests.

  // Let's iterate and build.
  // Note: For a robust app, we'd calculate exact indices. 
  // Here, for the demo, we'll try to insert at the end.
  // Google Docs API doesn't support "append" easily in batchUpdate without knowing the end index.
  // We will assume the document is empty and calculate.
  
  let currentIndex = 1 + `B-ROLL PLAN: ${filename}\n\n`.length;
  let coveredCount = 0;

  // We will construct requests to insert at the END.
  // But wait, inserting at 'end' means index is typically EOF-1.
  // To avoid index math hell, we will just format a text block and valid links.
  
  // Alternative: We generate the content, then make ONE insert call, then update styles/links.
  // It is hard to know indices after 1 insert.
  
  // Strategy: We will process segments in REVERSE order and always insert at index 1 (after title).
  // This pushes previous content down.
  // Wait, that reverses the document.
  
  // Let's stick to accumulating text and creating link ranges.
  let fullText = "";
  const linkRanges: { start: number; end: number; url: string }[] = [];
  const boldRanges: { start: number; end: number }[] = [];

  segments.forEach((seg) => {
    const sug = suggestions.find(s => s.segmentId === seg.id);
    const hasSug = !!sug;
    if (hasSug) coveredCount++;

    const header = `BLOCK ${seg.order + 1}\n`;
    const scriptText = `SCRIPT: "${seg.originalText.substring(0, 100)}${seg.originalText.length > 100 ? '...' : ''}"\n`;
    const notesText = seg.notes.length > 0 ? `NOTES: ${seg.notes.join(', ')}\n` : '';
    
    let brollText = "";
    if (sug) {
      brollText += `[${sug.mediaType}] Intent: ${sug.visualIntent}\n`;
      brollText += `Style: ${sug.styleParams.style} | Mood: ${sug.styleParams.mood}\n`;
      brollText += `SEARCH LINKS:\n`;
    } else {
      brollText += `NO B-ROLL SUGGESTED\n`;
    }

    const startOfBlock = currentIndex + fullText.length;
    
    // Append Header
    fullText += header;
    boldRanges.push({ start: startOfBlock, end: startOfBlock + header.length });

    fullText += scriptText;
    if (notesText) fullText += notesText;
    fullText += brollText;

    // Links
    if (sug) {
        const sources = [
            { name: "Google Images", url: sug.sources.googleImages },
            { name: "Pexels", url: sug.sources.pexels },
            { name: "Unsplash", url: sug.sources.unsplash },
            { name: "Pinterest", url: sug.sources.pinterest },
        ];

        sources.forEach(src => {
            const linkLabel = `🔗 ${src.name}\n`;
            const linkStart = currentIndex + fullText.length;
            fullText += linkLabel;
            linkRanges.push({ start: linkStart, end: linkStart + linkLabel.length - 1, url: src.url }); // -1 to skip newline
        });
    }
    
    fullText += "\n-------------------\n\n";
  });

  // Summary
  const summaryHeader = `SUMMARY\n`;
  fullText += summaryHeader;
  fullText += `Total Segments: ${segments.length}\n`;
  fullText += `Coverage: ${Math.round((coveredCount / segments.length) * 100)}%\n`;

  // Apply the Big Insert
  // Note: We need to account for the initial title length in our ranges.
  // currentIndex was set after title.
  
  // Adjust ranges relative to the insertion point (currentIndex)
  const adjustedRequests = [];
  
  // 1. Insert all text
  adjustedRequests.push({
    insertText: {
      location: { index: currentIndex },
      text: fullText
    }
  });

  // 2. Apply styles (Bold headers)
  boldRanges.forEach(r => {
      adjustedRequests.push({
          updateTextStyle: {
              range: { startIndex: currentIndex + (r.start - currentIndex), endIndex: currentIndex + (r.end - currentIndex) },
              textStyle: { bold: true },
              fields: 'bold'
          }
      });
  });

  // 3. Apply Links
  linkRanges.forEach(r => {
      adjustedRequests.push({
          updateTextStyle: {
              range: { startIndex: currentIndex + (r.start - currentIndex), endIndex: currentIndex + (r.end - currentIndex) },
              textStyle: { link: { url: r.url }, foregroundColor: { color: { rgbColor: { blue: 0.8, red: 0.1, green: 0.1 } } }, underline: true },
              fields: 'link,foregroundColor,underline'
          }
      });
  });

  await window.gapi.client.docs.documents.batchUpdate({
    documentId: docId,
    resource: { requests: adjustedRequests }
  });

  return {
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    stats: {
        totalSegments: segments.length,
        coveredSegments: coveredCount,
        coveragePercent: Math.round((coveredCount / segments.length) * 100)
    }
  };
};