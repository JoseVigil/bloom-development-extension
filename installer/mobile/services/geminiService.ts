import { GoogleGenAI, Type } from "@google/genai";
import { ProjectSpec } from "../types";

const API_KEY = process.env.API_KEY || "";

export const generateProjectSpec = async (idea: string, isNative: boolean): Promise<ProjectSpec> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const systemInstruction = `You are the Architect of BTIPS (Bloom Sovereign Identity Terminal). 
  BTIPS is the 'Human Root of Will' for the Bloom ecosystem.
  Technical constraints:
  - Architecture: Native Dual (SwiftUI for iOS, Jetpack Compose for Android).
  - Networking: Batcave Sync via Ports 48215 (REST) and 4124 (WS).
  - Aesthetic: Bloom Color Palette v1.0. 
    * Primary Background: #0f0f1e
    * Intelligence/Brain: Purple (#a855f7) to Magenta (#ec4899) gradients.
    * Governance/Nucleus: Success Green (#22c55e).
    * Exploration/Intents: Yellow (#eab308).
  - Role: You build authority interfaces for the Paladin.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `Generate a technical specification for the following request: "${idea}". 
    The app must be a definitive mobile authority terminal for iOS/Android.
    Include mythology (the conceptual role), features (Intent Board, Vault Control, Alfred Feed), 
    tech stacks, and a 3-phase roadmap.`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          mythology: { type: Type.STRING },
          features: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                complexity: { type: Type.STRING },
              },
              required: ["title", "description", "complexity"]
            }
          },
          techStacks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                platform: { type: Type.STRING },
                framework: { type: Type.STRING },
                language: { type: Type.STRING },
                networking: { type: Type.STRING },
                security: { type: Type.STRING },
                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["platform", "framework", "language", "networking", "security", "pros"]
            }
          },
          integrationDetails: {
            type: Type.OBJECT,
            properties: {
              restPort: { type: Type.STRING },
              wsPort: { type: Type.STRING },
              authMethod: { type: Type.STRING },
            }
          },
          roadmap: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                phase: { type: Type.STRING },
                tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["phase", "tasks"]
            }
          }
        },
        required: ["name", "description", "mythology", "features", "techStacks", "roadmap"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Failed to parse BTIPS response", error);
    throw new Error("Fallo en la sincronización con el Arquitecto.");
  }
};

export const getLogoSuggestion = async (appName: string, appDescription: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: `Mobile app icon for '${appName}'. Minimalist, purple #a855f7 and magenta #ec4899 gradient on deep navy background #0f0f1e. Symbolic of cognitive authority, shield or brain node. Vector style.`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return "";
};