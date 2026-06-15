require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY || "";
const url = `https://generativelanguage.googleapis.com/v1alpha/models?key=${apiKey}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    if (data.models) {
      data.models.forEach(m => {
        if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("bidiGenerateContent")) {
          console.log(m.name, m.supportedGenerationMethods);
        }
      });
      console.log("Done checking Bidi supported models.");
    } else {
      console.log(data);
    }
  })
  .catch(console.error);
