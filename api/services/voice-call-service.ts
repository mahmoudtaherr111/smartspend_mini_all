import { db } from "../queries/connection";
import { systemSettings, voiceUsage, apiKeyErrors, users, localUsers, sessions } from "../../db/schema";
import { eq, and, gt, sum } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";
import WebSocket from "ws";
import { getUserFinancialContextSummary } from "./voice-context-service";
import { TOOL_DEFINITIONS, executeTool } from "./ai-chat-tools";

// Helper to parse cookies
function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : undefined;
}

// Authenticate WebSocket request
async function authenticateUser(request: any, tokenParam: string | null): Promise<{ user: any; userType: "oauth" | "local"; tokenUsed: string } | null> {
  const cookieToken = parseCookie(request.headers.cookie, "google_session");
  const token = tokenParam || cookieToken;

  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any;
    if (!payload || !payload.userId) return null;

    const userId = Number(payload.userId);

    if (cookieToken && token === cookieToken) {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (dbUser) {
        return { user: dbUser, userType: "oauth", tokenUsed: token };
      }
    }

    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.token, token),
        eq(sessions.userId, userId),
        eq(sessions.userType, "local"),
        gt(sessions.expiresAt, new Date())
      ),
    });

    if (session) {
      const dbUser = await db.query.localUsers.findFirst({
        where: eq(localUsers.id, userId),
      });
      if (dbUser) {
        return { user: dbUser, userType: "local", tokenUsed: token };
      }
    }
  } catch (err) {
    console.error("[Voice Auth] JWT Verification failed:", err);
  }

  return null;
}



function resolveLiveModelId(modelName: string): string {
  if (modelName.startsWith("models/")) {
    return modelName;
  }
  return `models/${modelName}`;
}

export async function handleVoiceCallWebSocket(ws: WebSocket, request: any) {
  const parsedUrl = new URL(request.url || "", "http://localhost");
  const tokenParam = parsedUrl.searchParams.get("token");
  let voiceParam = parsedUrl.searchParams.get("voice") || "Aoede";
  const validVoices = ["Aoede", "Charon", "Fenrir", "Kore", "Puck"];
  if (!validVoices.includes(voiceParam)) {
    voiceParam = "Aoede";
  }

  const auth = await authenticateUser(request, tokenParam);
  if (!auth) {
    ws.send(JSON.stringify({ error: "يجب تسجيل الدخول أولاً للمتابعة" }));
    ws.close(1008);
    return;
  }

  const { user, userType } = auth;
  console.log(`[Voice Call] User connected: ${user.name} (${user.plan})`);

  // Load current settings
  const settings = await db.select().from(systemSettings);
  const config: Record<string, string> = {
    voice_call_model: "gemini-2.5-flash-native-audio-preview-12-2025",
    voice_call_enabled_free: "true",
    voice_call_limit_free: "5",
    voice_call_duration_free: "120",
    voice_call_enabled_pro: "true",
    voice_call_limit_pro: "60",
    voice_call_duration_pro: "600",
    voice_call_enabled_ultra: "true",
    voice_call_limit_ultra: "999999",
    voice_call_duration_ultra: "1200",
    ai_api_key: env.GEMINI_API_KEY || "",
    ai_api_key_2: "",
    ai_system_prompt:
      "[Persona] مستشار مالي مصري ذكي ومتعاطف. لغتك عامية مصرية راقية ومبسطة، وتتحدث وكأنك إنسان حقيقي.",
  };

  settings.forEach((s) => {
    if (s.value) config[s.key] = s.value;
  });

  const plan = user.plan || "free";
  const isEnabled = config[`voice_call_enabled_${plan}`] === "true";
  const limitMinutes = parseInt(config[`voice_call_limit_${plan}`] || "0");
  const maxCallSeconds = parseInt(config[`voice_call_duration_${plan}`] || "60");

  if (!isEnabled) {
    ws.send(JSON.stringify({ error: "المكالمة الصوتية غير متاحة في باقة حسابك الحالية" }));
    ws.close(1008);
    return;
  }

  // Calculate current month's usage
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const usageQuery = await db
    .select({ total: sum(voiceUsage.durationSeconds) })
    .from(voiceUsage)
    .where(
      and(
        eq(voiceUsage.userId, user.id),
        eq(voiceUsage.userType, userType),
        eq(voiceUsage.month, monthStr)
      )
    );
  
  const totalUsedSeconds = parseInt(usageQuery[0]?.total || "0");
  const remainingSecondsForMonth = (limitMinutes * 60) - totalUsedSeconds;
  const allowedCallSeconds = Math.min(maxCallSeconds, remainingSecondsForMonth);

  if (allowedCallSeconds <= 0) {
    ws.send(JSON.stringify({ error: "لقد استهلكت الحد الشهري المسموح به للمكالمات الصوتية" }));
    ws.close(1008);
    return;
  }

  console.log(`[Voice Call] Authorized. Duration: ${allowedCallSeconds}s`);

  // Assemble financial context and instructions
  const userContext = await getUserFinancialContextSummary(user.id, userType);
  const voiceSystemPrompt = `أنت "سمارت" — مستشار مالي مصري ذكي ومتعاطف.
تتكلم عامية مصرية راقية ومبسطة في مكالمة صوتية حية.

قواعد المكالمة:
- ردودك مختصرة جداً (جملة أو اتنين بس)
- متقراش جداول أو أرقام كتير — اعطي خلاصات ذكية
- كأنك صاحب ومستشار شخصي
- خلي الكلام ممتع وسريع

${userContext}`;

  // Start call session
  const callStartTime = Date.now();
  let usageSaved = false;
  let callTranscript: string[] = []; // To store AI's side of the conversation

  const endCallSession = async (closeCode: number, reason: string) => {
    if (usageSaved) return;
    usageSaved = true;

    const elapsedSeconds = Math.round((Date.now() - callStartTime) / 1000);
    console.log(`[Voice Call] Call ended. Duration: ${elapsedSeconds} seconds. Reason: ${reason}`);

    // Save voice usage
    if (elapsedSeconds > 0) {
      try {
        await db.insert(voiceUsage).values({
          userId: user.id,
          userType: userType,
          durationSeconds: elapsedSeconds,
          month: monthStr,
          source: "gemini_voice_call",
        });
      } catch (dbErr) {
        console.error("[Voice Call] Failed to save usage in database:", dbErr);
      }
    }

    // Save transcript to chat_messages if there was a conversation
    if (callTranscript.length > 0) {
      try {
        const { chatConversations, chatMessages } = await import("../../db/schema");
        const { desc } = await import("drizzle-orm");
        
        // Find latest conversation or create one
        let conversationId: number;
        const latestConvos = await db.select().from(chatConversations)
          .where(and(eq(chatConversations.userId, user.id), eq(chatConversations.userType, userType)))
          .orderBy(desc(chatConversations.lastMessageAt)).limit(1);

        if (latestConvos.length > 0) {
          conversationId = latestConvos[0].id;
        } else {
          const inserted = await db.insert(chatConversations).values({
            userId: user.id, userType: userType,
            title: "مكالمة صوتية", messageCount: 0, totalTokens: 0,
            lastMessageAt: new Date()
          });
          conversationId = (inserted as any).insertId || (inserted as any)[0]?.insertId;
        }

        const summaryText = "[ملخص المكالمة الصوتية - ما قاله المساعد]:\n" + callTranscript.join(" ");
        await db.insert(chatMessages).values({
          conversationId, role: "system", content: summaryText, tokensUsed: 0,
          createdAt: new Date()
        });
        console.log("[Voice Call] Saved call transcript to chat memory.");
      } catch (err) {
        console.error("[Voice Call] Failed to save transcript to chat:", err);
      }
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.close(closeCode);
    }
  };

  // Timer to enforce call duration limits
  const maxDurationTimeout = setTimeout(() => {
    ws.send(JSON.stringify({ status: "limit_reached", message: "انتهى الوقت الأقصى المسموح به للمكالمة." }));
    endCallSession(1000, "Max call duration limit reached");
  }, allowedCallSeconds * 1000);

  // Send warning 10 seconds before end
  let warningTimeout: NodeJS.Timeout | null = null;
  if (allowedCallSeconds > 15) {
    warningTimeout = setTimeout(() => {
      ws.send(JSON.stringify({ status: "warning", message: "باقي 10 ثوانٍ على انتهاء المكالمة" }));
    }, (allowedCallSeconds - 10) * 1000);
  }

  // 1. Resolve Live Model ID
  const targetModel = resolveLiveModelId(config.voice_call_model);

  // Helper to connect to Google Live API
  const connectToGoogleLive = async (
    modelId: string,
    apiKey: string,
    systemPrompt: string,
    voiceName: string
  ): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const googleWs = new WebSocket(url);
      let hasResolved = false;

      googleWs.on("open", () => {
        const setupMessage = {
          setup: {
            model: modelId,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName,
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            tools: [{
              functionDeclarations: TOOL_DEFINITIONS.map(t => t.function)
            }]
          },
        };
        googleWs.send(JSON.stringify(setupMessage));
      });

      googleWs.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.setupComplete) {
            hasResolved = true;
            resolve(googleWs);
          }
        } catch (e) {
          // Ignore
        }
      });

      googleWs.on("error", (err) => {
        if (!hasResolved) {
          reject(err);
        }
      });

      googleWs.on("close", (code, reason) => {
        if (!hasResolved) {
          reject(new Error(`Closed before setup complete: ${code} - ${reason.toString()}`));
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!hasResolved) {
          googleWs.close();
          reject(new Error("Connection to Gemini Live API timed out."));
        }
      }, 5000);
    });
  };

  // 2. Establish connection to Gemini Live with failover
  let googleWs: WebSocket;
  try {
    console.log(`[Voice Call] Connecting to Gemini Live API with primary key, model: ${targetModel}, voice: ${voiceParam}`);
    googleWs = await connectToGoogleLive(targetModel, config.ai_api_key, voiceSystemPrompt, voiceParam);
    console.log("[Voice Call] Successfully connected to Gemini Live API using primary key.");
  } catch (err: any) {
    console.warn("[Voice Call] Primary key connection failed:", err.message);
    await logApiKeyError("ai_api_key", err.message, user.id);

    if (config.ai_api_key_2) {
      try {
        console.log(`[Voice Call] Connecting with secondary key, model: ${targetModel}, voice: ${voiceParam}`);
        googleWs = await connectToGoogleLive(targetModel, config.ai_api_key_2, voiceSystemPrompt, voiceParam);
        console.log("[Voice Call] Successfully connected to Gemini Live API using secondary key.");
      } catch (err2: any) {
        console.error("[Voice Call] Secondary key connection failed:", err2.message);
        await logApiKeyError("ai_api_key_2", err2.message, user.id);
        ws.send(JSON.stringify({ error: "فشل الاتصال بمحرك الصوت، يرجى مراجعة إعدادات الـ API key." }));
        ws.close(1011);
        return;
      }
    } else {
      ws.send(JSON.stringify({ error: "فشل الاتصال بمحرك الصوت، يرجى مراجعة إعدادات الـ API key." }));
      ws.close(1011);
      return;
    }
  }

  // 3. Send ready signal to client browser
  ws.send(JSON.stringify({ 
    status: "ready", 
    message: "متصل الآن بالمستشار المالي",
    modelName: targetModel.replace("models/", "")
  }));

  // 4. Send opening greeting so the AI speaks first (user hears something immediately)
  if (googleWs.readyState === WebSocket.OPEN) {
    googleWs.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: "ابدأ المحادثة بتحية ودية قصيرة جداً ثم اسأل المستخدم كيف تقدر تساعده في مصاريفه اليوم." }]
        }],
        turnComplete: true
      }
    }));
    console.log("[Voice Call] Sent opening greeting prompt to Gemini.");
  }

  // 4. Handle incoming messages from browser client
  let binaryChunkCount = 0;
  ws.on("message", (data: any, isBinary: boolean) => {
    const isBin = isBinary || Buffer.isBuffer(data) || data instanceof ArrayBuffer;
    if (isBin) {
      binaryChunkCount++;
      if (binaryChunkCount % 50 === 1) {
        console.log(`[Voice Call] Received ${binaryChunkCount} binary chunks from browser. Last chunk size: ${data.length || data.byteLength || "unknown"}. Google state: ${googleWs.readyState}`);
      }
      if (googleWs.readyState === WebSocket.OPEN) {
        const base64Chunk = Buffer.isBuffer(data)
          ? data.toString("base64")
          : Buffer.from(data as any).toString("base64");
        googleWs.send(JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: "audio/pcm;rate=16000",
              data: base64Chunk
            }
          }
        }));
      }
    } else {
      try {
        const text = data.toString();
        console.log("[Voice Call] Received text from browser:", text);
        const parsed = JSON.parse(text);
        if (parsed.type === "end_call") {
          endCallSession(1000, "User clicked end call");
        }
      } catch (err) {
        // Ignore
      }
    }
  });

  // 5. Handle responses from Gemini
  let googleAudioChunkCount = 0;
  googleWs.on("message", async (googleData) => {
    try {
      const msg = JSON.parse(googleData.toString());
      
      if (msg.error) {
        console.error("[Voice Call] Google returned error:", JSON.stringify(msg.error));
      }

      if (msg.setupComplete) {
        console.log("[Voice Call] Google setup complete message received during active session.");
      }
      
      if (msg.toolCall) {
        console.log("[Voice Call] Received toolCall from Gemini Live API:", msg.toolCall);
        
        const functionResponses = [];
        for (const call of msg.toolCall.functionCalls) {
          const toolName = call.name;
          let args = {};
          try { args = call.args || {}; } catch {}
          
          console.log(`[Voice Call] Executing tool ${toolName} during call...`);
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "tool_execution",
              message: `يبحث في بياناتك... (${toolName})`
            }));
          }
          
          const resultString = await executeTool(toolName, args, { userId: user.id, userType });
          
          functionResponses.push({
            id: call.id,
            name: toolName,
            response: { result: JSON.parse(resultString) }
          });
        }
        
        if (googleWs.readyState === WebSocket.OPEN) {
          googleWs.send(JSON.stringify({
            toolResponse: {
              functionResponses
            }
          }));
          console.log("[Voice Call] Sent toolResponse back to Gemini.");
        }
      }

      if (msg.serverContent) {
        // --- Audio extraction: handle all known Gemini Live API response schemas ---

        // Schema A: serverContent.modelTurn.parts[*].inlineData (standard Live API)
        const modelTurn = msg.serverContent.modelTurn;
        if (modelTurn && modelTurn.parts) {
          for (const part of modelTurn.parts) {
            // Forward text parts to UI
            if (part.text) {
              console.log("[Voice Call] Gemini text part:", part.text);
              callTranscript.push(part.text);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "gemini_message",
                  payload: { serverContent: { modelTurn: { parts: [{ text: part.text }] } } }
                }));
              }
            }

            // Forward inline audio chunks from modelTurn.parts
            if (part.inlineData && part.inlineData.data) {
              googleAudioChunkCount++;
              const audioBuffer = Buffer.from(part.inlineData.data, "base64");
              if (googleAudioChunkCount <= 3 || googleAudioChunkCount % 20 === 0) {
                console.log(`[Voice Call] Schema-A audio chunk #${googleAudioChunkCount}, mimeType=${part.inlineData.mimeType || 'N/A'}, size=${audioBuffer.length} bytes`);
              }
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(audioBuffer);
              }
            }
          }
        }

        // Schema B: serverContent.inlineData (native audio dialog models — top-level inline data)
        if (msg.serverContent.inlineData && msg.serverContent.inlineData.data) {
          googleAudioChunkCount++;
          const audioBuffer = Buffer.from(msg.serverContent.inlineData.data, "base64");
          if (googleAudioChunkCount <= 3 || googleAudioChunkCount % 20 === 0) {
            console.log(`[Voice Call] Schema-B audio chunk #${googleAudioChunkCount}, mimeType=${msg.serverContent.inlineData.mimeType || 'N/A'}, size=${audioBuffer.length} bytes`);
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(audioBuffer);
          }
        }

        // Schema C: serverContent.parts[*].inlineData (alternate top-level parts)
        if (msg.serverContent.parts && Array.isArray(msg.serverContent.parts)) {
          for (const part of msg.serverContent.parts) {
            if (part.inlineData && part.inlineData.data) {
              googleAudioChunkCount++;
              const audioBuffer = Buffer.from(part.inlineData.data, "base64");
              if (googleAudioChunkCount <= 3 || googleAudioChunkCount % 20 === 0) {
                console.log(`[Voice Call] Schema-C audio chunk #${googleAudioChunkCount}, size=${audioBuffer.length} bytes`);
              }
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(audioBuffer);
              }
            }
            if (part.text) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "gemini_message",
                  payload: { serverContent: { modelTurn: { parts: [{ text: part.text }] } } }
                }));
              }
            }
          }
        }

        // Forward interruption signal
        if (msg.serverContent.interrupted) {
          console.log("[Voice Call] AI turn was interrupted by user speech.");
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ status: "interrupted" }));
          }
        }
      }
    } catch (e: any) {
      console.error("[Voice Call] Error parsing Google response:", e.message);
    }
  });

  googleWs.on("close", (code, reason) => {
    console.log(`[Voice Call] Gemini Live API connection closed: ${code} - ${reason.toString()}`);
    endCallSession(1000, "Gemini Live connection closed");
  });

  googleWs.on("error", (err) => {
    console.error("[Voice Call] Gemini Live API connection error:", err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error: "خطأ في الاتصال بمحرك الصوت التابع لـ Google" }));
    }
  });

  ws.on("close", (code) => {
    clearTimeout(maxDurationTimeout);
    if (warningTimeout) clearTimeout(warningTimeout);
    
    if (googleWs.readyState === WebSocket.OPEN || googleWs.readyState === WebSocket.CONNECTING) {
      googleWs.close();
    }
    
    endCallSession(code, `Browser closed socket with code ${code}`);
  });

  ws.on("error", (err) => {
    console.error("[Voice Call] Browser socket error:", err.message);
    if (googleWs.readyState === WebSocket.OPEN || googleWs.readyState === WebSocket.CONNECTING) {
      googleWs.close();
    }
  });
}

// Log key errors in database
async function logApiKeyError(keyLabel: string, message: string, userId: number) {
  try {
    let errorType = "unknown";
    if (message.includes("API key not valid") || message.includes("403") || message.includes("401")) {
      errorType = "invalid_key";
    } else if (message.includes("quota") || message.includes("429")) {
      errorType = "quota_exceeded";
    }

    await db.insert(apiKeyErrors).values({
      provider: "gemini",
      keyLabel,
      errorType,
      message,
      httpStatus: message.includes("429") ? 429 : message.includes("403") ? 403 : 500,
      userId,
      resolved: false,
    });
  } catch (err) {
    console.error("[Voice Call] Failed to log API Key error:", err);
  }
}
