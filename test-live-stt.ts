import { config } from "dotenv";
config();
import { geminiLiveSpeechToText } from './api/lib/ai-classifier.ts';

geminiLiveSpeechToText(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=', 
  'audio/wav', 
  'YOUR_GEMINI_API_KEY_HERE', 
  'gemini-2.5-flash-native-audio'
).then(console.log).catch(console.error);
