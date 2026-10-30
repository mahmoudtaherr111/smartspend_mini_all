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
import { createLogger } from "../lib/log";

/**
 * The WhatsApp Web client (Baileys) that still sends the monthly report, the phone-change code and admin messages
 * until they move to Meta's Cloud API (decision 0038). Verification codes no longer come through here: they are sent
 * by template (`api/lib/whatsapp/`). Message text and phone numbers never reach a log line (golden rule 10).
 */
const log = createLogger("whatsapp");

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
