import dotenv from "dotenv";
dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json() as any;
    console.log("Status:", res.status);
    
    if (data.models && Array.isArray(data.models)) {
      console.log("--- ALL RETURNED MODELS ---");
      data.models.forEach((m: any) => {
        console.log(`- ID: ${m.name} | Methods: ${m.supportedGenerationMethods.join(", ")}`);
      });
    } else {
      console.log("Unexpected format:", data);
    }
  } catch (err: any) {
    console.error("Fetch failed:", err.message);
  }
}

run();
