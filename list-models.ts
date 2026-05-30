import { GoogleGenerativeAI } from "@google/generative-ai";

async function listModels() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await response.json();
      
      console.log("=== Available Models for your API Key ===");
      data.models.forEach((m: any) => {
          if (m.name.includes("flash") || m.name.includes("audio") || m.name.includes("live")) {
             console.log(`- ${m.name}`);
          }
      });
  } catch (e) {
      console.error(e);
  }
}

listModels();
