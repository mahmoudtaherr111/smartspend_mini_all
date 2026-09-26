import { parseArgs } from "node:util";
import { buildCorpus, JOURNEYS, SYNTHETIC_CONVERSATIONS } from "./corpus";
import { evaluateRelease } from "./gates";
import { labReportPath, writeLabReport } from "./io";

const { values } = parseArgs({ options: { json: { type: "string", default: ".agents/reports/voice-lab/corpus.json" } } });
const output = labReportPath(values.json);
const corpus = buildCorpus();
const counts = Object.fromEntries(JOURNEYS.map(journey => [journey, corpus.filter(c => c.journey === journey).length]));
const release = evaluateRelease({ scope: "provider_only_synthetic", humanClips: 0, humanSpeakers: 0,
  journeyResults: {}, inventedNumbers: null, unintendedWrites: null, firstAudioP95Ms: null,
  measuredUsdPerMinute: null, adminCostCapUsdPerMinute: null, egyptianSpeechReviewed: false, interruptionTested: false });
writeLabReport(output, { schemaVersion: 1, createdAt: new Date().toISOString(), counts,
  humanClips: 0, humanSpeakers: 0, release, corpus, conversations: SYNTHETIC_CONVERSATIONS });
console.log(JSON.stringify({ utterances: corpus.length, counts, conversations: SYNTHETIC_CONVERSATIONS.length, release, reportPath: output }, null, 2));
