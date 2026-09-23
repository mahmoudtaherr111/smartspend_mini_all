/*
 * The live call's microphone tap (src/lib/voice/audio-io.ts). It collects 20 ms of samples at the device's rate
 * and hands them to the page, which filters them down to 16 kHz and decides whether the user is speaking
 * (src/lib/voice/downsampler.ts, speech-detector.ts). It is a plain file served from the app's own origin because
 * the page's Content-Security-Policy (script-src 'self') does not allow a worklet built from a blob: URL.
 */
class SmartSpendCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate * 0.02);
    this.block = new Float32Array(this.size);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const take = Math.min(channel.length - offset, this.size - this.filled);
      this.block.set(channel.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.size) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(this.size);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("smartspend-capture", SmartSpendCapture);
