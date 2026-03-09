import { Handler } from "@netlify/functions";
import { GoogleGenAI, Type } from "@google/genai";

export const handler: Handler = async (event) => {
  const url = event.queryStringParameters?.url;

  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "URL is required" }),
    };
  }

  try {
    // 1. Fetch HTML
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch: ${fetchRes.statusText}`);
    }
    const html = await fetchRes.text();

    // 2. Use Gemini to extract metadata
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract the game title, a short description, and a thumbnail image URL from this HTML content of a game page. Return only JSON.
      
      HTML Content (truncated):
      ${html.substring(0, 15000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            thumbnail: { type: Type.STRING },
          },
          required: ["title", "description", "thumbnail"],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
