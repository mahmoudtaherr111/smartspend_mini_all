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
import { createLogger, phoneTail } from "../lib/log";

// Codes, message text and phone numbers never reach a log line from here (golden rule 10); a number is
// written as its last four digits.
const log = createLogger("whatsapp");

export const otpEvents = new EventEmitter();

function matchPhoneNumber(expectedPhone: string, senderPhone: string): boolean {
  const expectedClean = expectedPhone.replace(/\D/g, ""); // e.g. "010XXXXXXXX"
  const senderClean = senderPhone.replace(/\D/g, "");     // e.g. a 14-digit LID
  
  if (expectedClean === senderClean) return true;
  
  // Format as 20xxxxxxxxx
  let internationalPhone = expectedClean;
  if (expectedClean.startsWith("0")) {
    internationalPhone = "2" + expectedClean.substring(1); // "2010XXXXXXXX"
  } else if (!expectedClean.startsWith("2")) {
    internationalPhone = "20" + expectedClean;
  }
  
  // Check LID mapping in whatsapp_auth_info
  try {
    const lidFile = path.join(process.cwd(), "whatsapp_auth_info", `lid-mapping-${internationalPhone}.json`);
    if (fs.existsSync(lidFile)) {
      const content = fs.readFileSync(lidFile, "utf-8").trim();
      const mappedLid = JSON.parse(content); // e.g. a 14-digit LID
      if (mappedLid.replace(/\D/g, "") === senderClean) {
        log.info({ event: "whatsapp.lid.matched", phone: phoneTail(internationalPhone) }, "Sender matched through its LID");
        return true;
      }
    }
  } catch (e) {
    log.error({ err: e, event: "whatsapp.lid.read_failed" }, "Could not read a LID mapping");
  }
  
  // Also try reverse LID file
  try {
    const reverseLidFile = path.join(process.cwd(), "whatsapp_auth_info", `lid-mapping-${senderClean}_reverse.json`);
    if (fs.existsSync(reverseLidFile)) {
      const content = fs.readFileSync(reverseLidFile, "utf-8").trim();
      const mappedJid = JSON.parse(content); // e.g. "2010XXXXXXXX@s.whatsapp.net"
      const mappedPhone = mappedJid.split("@")[0].replace(/\D/g, "");
      
      let mappedClean = mappedPhone;
      if (mappedPhone.startsWith("20") && mappedPhone.length === 12) {
        mappedClean = "0" + mappedPhone.substring(2);
      }
      
      if (mappedClean === expectedClean) {
        log.info({ event: "whatsapp.lid.reverse_matched", phone: phoneTail(expectedClean) }, "Sender matched through a reverse LID");
        return true;
      }
    }
  } catch (e) {
    log.error({ err: e, event: "whatsapp.lid.reverse_read_failed" }, "Could not read a reverse LID mapping");
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
        log.info({ event: "whatsapp.qr" }, "New QR code for the admin to scan");
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as any)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        this.status = "disconnected";
        this.qrCode = null;

        log.warn(
          { err: lastDisconnect?.error, event: "whatsapp.connection.closed", reconnecting: shouldReconnect },
          "WhatsApp connection closed",
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
          log.info({ event: "whatsapp.logged_out" }, "Logged out; the session was deleted");
        }
      } else if (connection === "open") {
        log.info({ event: "whatsapp.connection.open" }, "WhatsApp connected");
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
            log.info({ event: "whatsapp.lid.saved", phone: phoneTail(phoneClean) }, "Saved a LID mapping");
          } catch (e) {
            log.error({ err: e, event: "whatsapp.lid.save_failed" }, "Could not save a LID mapping");
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

              // Anti Brute-Force: Check if the sender is currently blocked
              if (isSenderBlocked(senderPhone)) {
                log.warn({ event: "whatsapp.otp.blocked_sender", phone: phoneTail(senderPhone) }, "Ignored a code from a blocked sender");
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

                  log.info({ event: "whatsapp.otp.verified", phone: phoneTail(senderPhone) }, "A number proved it sent its code");
                  otpEvents.emit(`otp:${record.phone}`, { status: "verified" });
                  
                } else {
                  log.warn(
                    { event: "whatsapp.otp.wrong_sender", expected: phoneTail(record.phone), sender: phoneTail(senderPhone) },
                    "A code arrived from a number other than the one it was issued for",
                  );
                  
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
                log.warn({ event: "whatsapp.otp.unknown_code", phone: phoneTail(senderPhone) }, "An unknown or expired code arrived");
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
    log.info({ event: "whatsapp.stopped" }, "WhatsApp stopped by an admin");
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
