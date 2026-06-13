import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { db } from "../queries/connection";
import { whatsappOtpCodes } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { EventEmitter } from "events";
import { otpCache, isSenderBlocked, recordWrongAttempt } from "./otp-cache";

export const otpEvents = new EventEmitter();

function matchPhoneNumber(expectedPhone: string, senderPhone: string): boolean {
  const expectedClean = expectedPhone.replace(/\D/g, ""); // e.g. "01062975286"
  const senderClean = senderPhone.replace(/\D/g, "");     // e.g. "39934824042693"
  
  if (expectedClean === senderClean) return true;
  
  // Format as 20xxxxxxxxx
  let internationalPhone = expectedClean;
  if (expectedClean.startsWith("0")) {
    internationalPhone = "2" + expectedClean.substring(1); // "201062975286"
  } else if (!expectedClean.startsWith("2")) {
    internationalPhone = "20" + expectedClean;
  }
  
  // Check LID mapping in whatsapp_auth_info
  try {
    const lidFile = path.join(process.cwd(), "whatsapp_auth_info", `lid-mapping-${internationalPhone}.json`);
    if (fs.existsSync(lidFile)) {
      const content = fs.readFileSync(lidFile, "utf-8").trim();
      const mappedLid = JSON.parse(content); // e.g. "39934824042693"
      if (mappedLid.replace(/\D/g, "") === senderClean) {
        console.log(`[WhatsApp] Successfully mapped JID ${internationalPhone} to LID ${senderClean}`);
        return true;
      }
    }
  } catch (e) {
    console.error(`[WhatsApp] Error reading LID mapping:`, e);
  }
  
  // Also try reverse LID file
  try {
    const reverseLidFile = path.join(process.cwd(), "whatsapp_auth_info", `lid-mapping-${senderClean}_reverse.json`);
    if (fs.existsSync(reverseLidFile)) {
      const content = fs.readFileSync(reverseLidFile, "utf-8").trim();
      const mappedJid = JSON.parse(content); // e.g. "201062975286@s.whatsapp.net"
      const mappedPhone = mappedJid.split("@")[0].replace(/\D/g, "");
      
      let mappedClean = mappedPhone;
      if (mappedPhone.startsWith("20") && mappedPhone.length === 12) {
        mappedClean = "0" + mappedPhone.substring(2);
      }
      
      if (mappedClean === expectedClean) {
        console.log(`[WhatsApp] Successfully mapped reverse LID ${senderClean} to phone ${expectedClean}`);
        return true;
      }
    }
  } catch (e) {
    console.error(`[WhatsApp] Error reading reverse LID mapping:`, e);
  }

  return false;
}

type WhatsAppStatus = "disconnected" | "connecting" | "qr" | "connected";

class WhatsAppService {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private status: WhatsAppStatus = "disconnected";
  private qrCode: string | null = null;
  private sessionDir: string;

  constructor() {
    this.sessionDir = path.join(process.cwd(), "whatsapp_auth_info");
    
    // Ensure the auth folder exists, if not, create it
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  public getStatus() {
    let phoneNumber = null;
    const userId = this.sock?.user?.id || this.sock?.authState?.creds?.me?.id;
    if (userId) {
      phoneNumber = userId.split(":")[0].split("@")[0];
    } else if (fs.existsSync(path.join(this.sessionDir, "creds.json"))) {
      try {
        const creds = JSON.parse(fs.readFileSync(path.join(this.sessionDir, "creds.json"), "utf8"));
        if (creds?.me?.id) {
          phoneNumber = creds.me.id.split(":")[0].split("@")[0];
        }
      } catch (e) {
        // ignore
      }
    }
    return {
      status: this.status,
      qrCode: this.qrCode,
      phoneNumber,
    };
  }

  public async start() {
    if (this.status !== "disconnected") {
      return; // Already running or connecting
    }
    this.status = "connecting";

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: "silent" }); // Mute logs for clean console

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = "qr";
        // Generate QR Code as Data URL for the frontend
        this.qrCode = await QRCode.toDataURL(qr);
        console.log("[WhatsApp] New QR Code generated for admin to scan.");
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as any)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        this.status = "disconnected";
        this.qrCode = null;

        console.log(
          "[WhatsApp] Connection closed due to",
          lastDisconnect?.error,
          ", reconnecting:",
          shouldReconnect
        );

        if (shouldReconnect) {
          // Add a small delay before reconnecting to prevent rapid loop crashes
          setTimeout(() => {
             // Only reconnect if we haven't been manually stopped
             if (this.status === "disconnected") {
               this.start();
             }
          }, 3000);
        } else {
          // Logged out, delete session so a new QR can be generated next time
          if (fs.existsSync(this.sessionDir)) {
            fs.rmSync(this.sessionDir, { recursive: true, force: true });
          }
          console.log("[WhatsApp] Logged out. Session deleted.");
        }
      } else if (connection === "open") {
        console.log("[WhatsApp] Connection opened successfully!");
        this.status = "connected";
        this.qrCode = null; // No longer need QR
      }
    });

    // Save LID mappings automatically when Baileys detects contacts
    this.sock.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        if (contact.id && contact.lid) {
          const phoneClean = contact.id.split("@")[0].replace(/\D/g, "");
          const lidClean = contact.lid.split("@")[0].replace(/\D/g, "");
          try {
            const lidFile = path.join(this.sessionDir, `lid-mapping-${phoneClean}.json`);
            fs.writeFileSync(lidFile, JSON.stringify(lidClean));
            const reverseLidFile = path.join(this.sessionDir, `lid-mapping-${lidClean}_reverse.json`);
            fs.writeFileSync(reverseLidFile, JSON.stringify(contact.id));
            console.log(`[WhatsApp] Saved LID mapping for ${phoneClean} <-> ${lidClean}`);
          } catch (e) {
            console.error(`[WhatsApp] Failed to save LID mapping:`, e);
          }
        }
      }
    });

    // Listen to incoming messages for the reverse-verification feature (Click to chat)
    this.sock.ev.on("messages.upsert", async (m) => {
      if (m.type === "notify") {
        for (const msg of m.messages) {
          if (!msg.key.fromMe && msg.message) {
            const text =
              msg.message.conversation ||
              msg.message.extendedTextMessage?.text;

            let code = null;
            if (text) {
              const match = text.match(/SS-\d{6}/);
              if (match) {
                code = match[0];
              } else if (text.trim().startsWith("SS-")) {
                code = text.trim();
              }
            }

            if (!code) continue;

              console.log("[WhatsApp Debug] msg.key:", JSON.stringify(msg.key));
              console.log("[WhatsApp Debug] msg.message:", JSON.stringify(msg.message));

              const remoteJid = msg.key.remoteJid;
              if (!remoteJid) continue;

              // Clean up the sender's JID to extract the pure phone number
              // If it's a group, the sender is msg.key.participant, otherwise it's remoteJid
              const senderJid = msg.key.participant || remoteJid;
              let senderPhone = senderJid.split("@")[0];
              // If the JID contains a colon (like in multi-device), split it
              if (senderPhone.includes(":")) {
                senderPhone = senderPhone.split(":")[0];
              }

              // Convert 201xxxxxxxxx to 01xxxxxxxxx to match our database format
              if (senderPhone.startsWith("20") && senderPhone.length === 12) {
                senderPhone = "0" + senderPhone.substring(2);
              }

              console.log(`[WhatsApp] Cleaned Sender Phone: ${senderPhone}`);

              // Anti Brute-Force: Check if the sender is currently blocked
              if (isSenderBlocked(senderPhone)) {
                console.log(`[WhatsApp Blocklist] Ignoring message from blocked sender: ${senderPhone}`);
                continue;
              }

              // Check if code exists in our in-memory cache (0 database reads!)
              // Since the Map has keys by phone, we search for the session matching the code
              const activeSessions = Array.from(otpCache.values());
              const record = activeSessions.find((s) => s.code === code && s.expiresAt > Date.now());

              if (record) {
                // Fraud Prevention: Ensure the sender's phone number matches the phone number for this code (supporting LIDs)
                if (matchPhoneNumber(record.phone, senderPhone)) {
                  
                  // Mark as verified in memory (0 database writes!)
                  record.verified = true;

                  console.log(`[WhatsApp] Code ${code} verified successfully! (Sender: ${senderPhone})`);
                  otpEvents.emit(`otp:${record.phone}`, { status: "verified" });
                  
                } else {
                  console.log(`[WhatsApp] Fraud attempt detected! Code ${code} belongs to ${record.phone} but sent by ${senderPhone}`);
                  
                  // Record failed attempt for sender
                  recordWrongAttempt(senderPhone);

                  otpEvents.emit(`otp:${record.phone}`, { 
                    status: "fraud", 
                    expected: record.phone, 
                    actual: senderPhone 
                  });
                }
              } else {
                // Invalid code, record failed attempt to prevent scanning
                recordWrongAttempt(senderPhone);
                console.log(`[WhatsApp] Invalid or expired code received: ${code} from ${senderPhone}`);
              }
          }
        }
      }
    });
  }

  public async stop() {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
    this.status = "disconnected";
    this.qrCode = null;
    console.log("[WhatsApp] Service stopped manually.");
  }

  public async sendMessage(phone: string, text: string) {
    if (this.status !== "connected" || !this.sock) {
      throw new Error("WhatsApp is not connected");
    }

    // Format phone number to WhatsApp JID format
    // Clean all non-digit characters
    let jid = phone.replace(/\D/g, "");
    
    // Automatically format Egyptian local numbers (010, 011, etc.) to 2010, 2011...
    if (jid.startsWith("0")) {
      jid = "2" + jid;
    } else if (jid.length === 10 && jid.startsWith("1")) {
      jid = "20" + jid;
    }

    // Ensure it ends with @s.whatsapp.net
    if (!jid.includes("@s.whatsapp.net")) {
      jid = `${jid}@s.whatsapp.net`;
    }

    // Check if the number exists on WhatsApp (optional but recommended)
    const results = await this.sock.onWhatsApp(jid);
    const result = results?.[0];
    if (!result || !result.exists) {
      throw new Error("This number is not registered on WhatsApp");
    }

    // Simulate human typing presence
    await this.sock.presenceSubscribe(jid);
    await delay(500);
    await this.sock.sendPresenceUpdate("composing", jid);
    await delay(2000); // Wait 2 seconds while "typing"
    await this.sock.sendPresenceUpdate("paused", jid);

    // Send the actual message
    const msg = await this.sock.sendMessage(jid, { text });
    return msg;
  }
}

// Export as singleton, protecting against Vite HMR creating multiple connections
let whatsappService: WhatsAppService;
const globalForWhatsApp = global as unknown as { whatsappService: WhatsAppService };

if (!globalForWhatsApp.whatsappService) {
  globalForWhatsApp.whatsappService = new WhatsAppService();
}
whatsappService = globalForWhatsApp.whatsappService;

export { whatsappService };
