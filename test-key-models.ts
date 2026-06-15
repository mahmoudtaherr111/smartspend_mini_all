import dotenv from "dotenv";
dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  console.log("Fetching available models using user key...");
  try {
    const res = await fetch(url);
    console.log("Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Response:", text);
  } catch (err: any) {
    console.error("Fetch failed:", err.message);
  }
}

run();
