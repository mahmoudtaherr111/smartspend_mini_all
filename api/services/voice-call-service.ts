import { db } from "../queries/connection";
import { systemSettings, voiceUsage, apiKeyErrors, users, localUsers, sessions } from "../../db/schema";
import { eq, and, gt, sum } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";
import { getCacheRuntimeStatus } from "../lib/redis-client";
import WebSocket from "ws";
import {
  VOICE_TOOL_DECLARATIONS,
  buildVoiceHotContext,
  buildVoiceSystemPrompt,
  clearVoiceSessionState,
  createVoiceSessionState,
  endVoiceSessionState,
  executeVoiceTool,
  prefetchVoiceTurnContext,
  persistVoiceCallArchive,
  type VoiceArchiveMessage,
  type VoiceToolResponse,
} from "./voice-kernel";
import { embeddingApiCallsFromCacheHits, embeddingApiStatusFor, type DataNeed } from "./ai-kernel";
import { recordAICostMetric, resolveAICostPolicy } from "./ai-cost-policy";

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

export function normalizeVoiceToolResponse(resultString: string): Record<string, unknown> {
  const trimmed = resultString.trim();
  if (!trimmed) {
    return { result: "" };
  }

  try {
    return { result: JSON.parse(trimmed) as unknown };
  } catch {
    return { result_text: trimmed };
  }
}

export function summarizeVoiceToolResponse(toolName: string, response: unknown): Record<string, unknown> {
  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const dataNeeds = Array.isArray(record.dataNeeds)
    ? record.dataNeeds
        .map((need) =>
          need && typeof need === "object" && "kind" in need
            ? String((need as { kind?: unknown }).kind)
            : "",
        )
        .filter(Boolean)
    : [];
  const facts = Array.isArray(record.facts) ? record.facts : [];
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const cacheHits = Array.isArray(record.cacheHits) ? record.cacheHits.map((hit) => String(hit)) : [];
  const retrievalPolicy =
    record.retrievalPolicy && typeof record.retrievalPolicy === "object"
      ? record.retrievalPolicy
      : undefined;
  const embeddingApiStatus =
    typeof record.embeddingApiStatus === "string"
      ? record.embeddingApiStatus
      : embeddingApiStatusFor(
          dataNeeds.map((kind, index) => ({ id: `voice_summary_${index}`, kind })) as DataNeed[],
          cacheHits,
        );
  const result = record.result && typeof record.result === "object" ? (record.result as Record<string, unknown>) : {};
  const errors = Array.isArray(result.errors) ? result.errors.map((item) => String(item)).filter(Boolean) : [];

  return {
    toolName,
    ok: record.ok === true,
    dataNeeds,
    factCount: facts.length,
    artifactCount: artifacts.length,
    cacheHits,
    embeddingCalls: embeddingApiCallsFromCacheHits(cacheHits),
    embeddingApiStatus,
    retrievalPolicy,
    cacheRuntime: getCacheRuntimeStatus(),
    error: typeof record.error === "string" ? record.error : undefined,
    errors,
  };
}

function extractTranscriptionText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const text = record.text ?? record.content ?? record.transcript;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}

export function buildVoiceToolLimitResponse(toolName: string, maxToolRounds: number): VoiceToolResponse {
  return {
    ok: false,
    tool: toolName,
    error: `voice_tool_limit_exceeded:${maxToolRounds}`,
    result: {
      errors: [`voice_tool_limit_exceeded:${maxToolRounds}`],
      requiresConfirmation: false,
      requiresUiConfirmation: false,
    },
  };
}

function isVoiceConfirmationTool(toolName: string): boolean {
  return toolName === "action_confirm" || toolName === "action_cancel";
}

export function shouldExecuteLiveVoiceTool(input: {
  toolName: string;
  executedToolCalls: number;
  maxToolRounds: number;
}): {
  execute: boolean;
  countsTowardLimit: boolean;
  maxToolRounds: number;
  reason: "within_limit" | "confirmation_or_cancel" | "tool_limit_exceeded";
} {
  const maxToolRounds = Math.max(0, Math.floor(input.maxToolRounds));
  if (isVoiceConfirmationTool(input.toolName)) {
    return {
      execute: true,
      countsTowardLimit: false,
      maxToolRounds,
      reason: "confirmation_or_cancel",
    };
  }

  if (input.executedToolCalls >= maxToolRounds) {
    return {
      execute: false,
      countsTowardLimit: false,
      maxToolRounds,
      reason: "tool_limit_exceeded",
    };
  }

  return {
    execute: true,
    countsTowardLimit: true,
    maxToolRounds,
    reason: "within_limit",
  };
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
    voice_call_model: "gemini-2.5-flash-native-audio-latest",
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
  const voicePolicy = resolveAICostPolicy({
    channel: "voice",
    plan,
    role: user.role,
    settings: config,
  });
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

  // Assemble a compact voice context. Deeper facts are fetched by voice tools on demand.
  let voiceSession: Awaited<ReturnType<typeof createVoiceSessionState>>;
  let hotContext: Awaited<ReturnType<typeof buildVoiceHotContext>>;
  try {
    voiceSession = await createVoiceSessionState({
      userId: user.id,
      userType,
      userPlan: plan,
    });
    hotContext = await buildVoiceHotContext({
      userId: user.id,
      userType,
      userPlan: plan,
      sessionId: voiceSession.sessionId,
    });
  } catch (error) {
    console.error("[Voice Call] Failed to initialize voice session", error);
    ws.send(JSON.stringify({
      error: "تعذر بدء المكالمة الصوتية لأن حالة الجلسة السريعة غير متاحة حاليا. تأكد من إعداد Redis ثم جرّب تاني.",
    }));
    ws.close(1011);
    return;
  }
  const voiceSystemPrompt = buildVoiceSystemPrompt(hotContext);

  // Start call session
  const callStartTime = Date.now();
  let usageSaved = false;
  let callTranscript: VoiceArchiveMessage[] = [];
  let voiceToolCallCount = 0;
  let blockedVoiceToolCallCount = 0;
  let earlyPrefetchStarted = false;

  const maybePrefetchEarlyTurn = (transcript: string) => {
    if (earlyPrefetchStarted) return;
    if (Date.now() - callStartTime > 2500) return;
    earlyPrefetchStarted = true;
    void prefetchVoiceTurnContext({
      ctx: {
        userId: user.id,
        userType,
        userPlan: plan,
        sessionId: voiceSession.sessionId,
      },
      transcript,
    }).catch((error: unknown) => {
      console.warn("[Voice Prefetch] failed", error instanceof Error ? error.message : String(error));
    });
  };

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

    // Archive voice memory in its own conversation, never inside the latest chat.
    if (callTranscript.length > 0) {
      try {
        await persistVoiceCallArchive({
          userId: user.id,
          userType,
          sessionId: voiceSession.sessionId,
          transcript: callTranscript,
        });
        console.log("[Voice Call] Archived voice call memory.");
      } catch (err) {
        console.error("[Voice Call] Failed to archive voice call:", err);
      }
    }

    try {
      await endVoiceSessionState(voiceSession.sessionId);
      await clearVoiceSessionState(voiceSession.sessionId);
    } catch (err) {
      console.error("[Voice Call] Failed to close voice session state:", err);
    }

    void recordAICostMetric({
      userId: user.id,
      userType,
      channel: "voice",
      plan,
      intentKind: "voice_session",
      model: targetModel,
      inputTokens: Math.ceil(elapsedSeconds * 6),
      outputTokens: 0,
      totalTokens: Math.ceil(elapsedSeconds * 6),
      llmCalls: 1,
      toolCalls: voiceToolCallCount,
      latencyMs: elapsedSeconds * 1000,
      metadata: {
        reason,
        closeCode,
        sessionId: voiceSession.sessionId,
        durationSeconds: elapsedSeconds,
        maxOutputTokens: voicePolicy.maxOutputTokens,
        maxToolRounds: voicePolicy.maxToolRounds,
        blockedToolCalls: blockedVoiceToolCallCount,
      },
    });

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
              functionDeclarations: VOICE_TOOL_DECLARATIONS
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
    modelName: targetModel.replace("models/", ""),
    voiceSessionId: voiceSession.sessionId
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
        if ((parsed.type === "user_transcript" || parsed.type === "transcript") && typeof parsed.text === "string") {
          callTranscript.push({ role: "user", content: parsed.text });
          maybePrefetchEarlyTurn(parsed.text);
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

          const toolDecision = shouldExecuteLiveVoiceTool({
            toolName,
            executedToolCalls: voiceToolCallCount,
            maxToolRounds: voicePolicy.maxToolRounds,
          });
          if (!toolDecision.execute) {
            blockedVoiceToolCallCount += 1;
            const limitResponse = buildVoiceToolLimitResponse(toolName, toolDecision.maxToolRounds);

            console.warn(
              `[Voice Call] Blocked tool ${toolName}; maxToolRounds=${toolDecision.maxToolRounds} already reached.`,
            );

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "voice_tool_result",
                payload: summarizeVoiceToolResponse(toolName, limitResponse),
              }));
            }

            functionResponses.push({
              id: call.id,
              name: toolName,
              response: limitResponse,
            });
            continue;
          }

          if (toolDecision.countsTowardLimit) {
            voiceToolCallCount += 1;
          }
          
          console.log(`[Voice Call] Executing tool ${toolName} during call...`);
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "tool_execution",
              toolName,
              message: `يبحث في بياناتك... (${toolName})`
            }));
          }
          
          const toolResponse = await executeVoiceTool({
            toolName,
            args: args as Record<string, unknown>,
            ctx: {
              userId: user.id,
              userType,
              userPlan: plan,
              sessionId: voiceSession.sessionId,
            },
          });

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "voice_tool_result",
              payload: summarizeVoiceToolResponse(toolName, toolResponse),
            }));
          }
          
          functionResponses.push({
            id: call.id,
            name: toolName,
            response: toolResponse
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
        const inputTranscript = extractTranscriptionText(msg.serverContent.inputTranscription);
        if (inputTranscript) {
          callTranscript.push({ role: "user", content: inputTranscript });
          maybePrefetchEarlyTurn(inputTranscript);
        }

        const outputTranscript = extractTranscriptionText(msg.serverContent.outputTranscription);
        if (outputTranscript) {
          callTranscript.push({ role: "assistant", content: outputTranscript });
        }

        // Schema A: serverContent.modelTurn.parts[*].inlineData (standard Live API)
        const modelTurn = msg.serverContent.modelTurn;
        if (modelTurn && modelTurn.parts) {
          for (const part of modelTurn.parts) {
            // Forward text parts to UI
            if (part.text) {
              console.log("[Voice Call] Gemini text part:", part.text);
              callTranscript.push({ role: "assistant", content: part.text });
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
              callTranscript.push({ role: "assistant", content: part.text });
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
