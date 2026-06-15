require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY || "";
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    if (data.models) {
      data.models.forEach(m => {
        if (m.name.includes("flash") || m.name.includes("audio") || m.name.includes("live") || m.name.includes("gemini-2") || m.name.includes("gemini-3")) {
          console.log(m.name, m.supportedGenerationMethods);
        }
      });
    } else {
      console.log(data);
    }
  })
  .catch(console.error);
