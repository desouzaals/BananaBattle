import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Generates an image based on the specific model capabilities.
 * Supports text-to-image and image-to-image (for Flash models).
 */
export const generateImage = async (
  modelLabel: string, 
  prompt: string,
  referenceImages: string[] = []
): Promise<string> => {
  
  // Map user-friendly labels to actual SDK model IDs
  
  if (modelLabel.includes('flash-image')) {
    // Flash Image supports Image-to-Image / Editing
    // Model ID: gemini-2.5-flash-image
    return generateContentImage('gemini-2.5-flash-image', prompt, referenceImages);
  } 
  else {
    // Pro Image Preview
    // Model ID: gemini-3-pro-image-preview
    // Supports Multimodal input (Text + Image)
    return generateContentImage('gemini-3-pro-image-preview', prompt, referenceImages);
  }
};

/**
 * Analyzes an image and generates a detailed, professional prompt description.
 */
export const generateImageDescription = async (base64Image: string): Promise<string> => {
  try {
    // Initialize client here to ensure fresh API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Extract MimeType from Data URL
    const mimeMatch = base64Image.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    
    // Remove data URL prefix
    const base64Data = base64Image.split(',')[1];

    const prompt = "Analyze this image and provide a professional, coherent image generation prompt. Describe the image including details, lighting, character features, facial proportions, expressions, materials, and style. Output ONLY the prompt description.";

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    return response.text || "Failed to analyze image.";
  } catch (error: any) {
    console.error("Reverse Prompt Error:", error);
    throw new Error(error.message || "Failed to generate description from image");
  }
};

/**
 * Adds a watermark to the generated image
 */
const addWatermark = (base64Image: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Image);
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Watermark Config
      const fontSize = Math.max(12, Math.floor(img.height * 0.03));
      ctx.font = `bold ${fontSize}px monospace`;
      const text = "BananaBattle | ZHO";
      const padding = fontSize / 2;
      const textWidth = ctx.measureText(text).width;
      const boxWidth = textWidth + (padding * 2);
      const boxHeight = fontSize + padding;

      // Position: Bottom Right
      const x = img.width - boxWidth - padding;
      const y = img.height - boxHeight - padding;

      // Draw Box
      ctx.fillStyle = '#111111';
      ctx.fillRect(x, y, boxWidth, boxHeight);

      // Draw Text
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + padding, y + (boxHeight / 2) + 2);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base64Image);
    img.src = base64Image;
  });
};

const generateContentImage = async (model: string, prompt: string, images: string[]): Promise<string> => {
  try {
    // Initialize client here to ensure fresh API key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const parts: any[] = [];

    // Add reference images if available
    if (images && images.length > 0) {
      images.forEach(base64Data => {
        // Extract MimeType from Data URL (e.g., "data:image/png;base64,..." -> "image/png")
        const mimeMatch = base64Data.match(/^data:(.*);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

        // Remove data URL prefix for the API call
        const base64Clean = base64Data.split(',')[1]; 
        
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Clean
          }
        });
      });
    }

    // Add the text prompt, or a default one if images exist but prompt is empty
    const finalPrompt = prompt.trim() || (images.length > 0 ? "Generate an image based on the provided visual references." : "");
    
    if (finalPrompt) {
        parts.push({ text: finalPrompt });
    } else {
        throw new Error("Prompt is required");
    }

    // Config specific to models
    const config: any = {
        responseModalities: [Modality.IMAGE],
    };

    // Specific config for gemini-3-pro-image-preview to ensure standard square aspect ratio
    if (model === 'gemini-3-pro-image-preview') {
        config.imageConfig = {
            aspectRatio: '1:1',
            imageSize: '1K' 
        };
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
      },
      config: config,
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned");
    }

    const contentParts = candidates[0].content?.parts;
    if (!contentParts) {
      throw new Error("No content parts returned");
    }

    for (const part of contentParts) {
      if (part.inlineData && part.inlineData.data) {
        const rawBase64 = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        return await addWatermark(rawBase64);
      }
    }
    throw new Error("No image data found in response");
  } catch (error: any) {
    console.error(`${model} Generation Error:`, error);
    throw new Error(error.message || `Failed to generate image with ${model}`);
  }
};