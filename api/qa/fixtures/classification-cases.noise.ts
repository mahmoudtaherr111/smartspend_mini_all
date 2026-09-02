/**
 * STT corruption, orthographic variance and Franco-Arabic.
 *
 * IMPORTANT: this bucket encodes *plausible* speech-to-text noise, hand-authored.
 * It is our model of the problem, not a sample of it. Until real transcripts are
 * captured from the voice path and replayed, this bucket's score is a proxy.
 */
import type { BenchmarkCase } from "./classification-cases.types";

export const NOISE_CASES: BenchmarkCase[] = [
  {
    id: "NOI-001",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "دفعت فاتوره الكهربا اربعميه وخمسين",
    expectedItems: [
      { amount: 450, type: "expense", category: "فواتير", subCategory: "كهرباء" },
    ],
    tags: ["stt_ta_marbuta", "word_number"],
  },
  {
    id: "NOI-002",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "روحت الصيدليه وجبت دوا بميتين",
    expectedItems: [
      { amount: 200, type: "expense", category: "صحة", subCategory: "صيدلية" },
    ],
    tags: ["stt_ta_marbuta", "attached_preposition"],
  },
  {
    id: "NOI-003",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "شربت شاى فى القهوجى ب عشره",
    expectedItems: [
      { amount: 10, type: "expense", category: "أكل وشرب", subCategory: "قهوة وكافيه" },
    ],
    tags: ["stt_alef_maqsura", "detached_ba"],
  },
  {
    id: "NOI-004",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "7awalt 500 gneh l Ahmed 3ala instapay",
    knownPeople: [
      { name: "أحمد", relationship: "صديق", category: "أصدقاء", subCategory: "أحمد صاحبك" },
    ],
    expectedItems: [
      {
        amount: 500,
        type: "expense",
        category: "أصدقاء",
        subCategory: "أحمد صاحبك",
        categoryAnyOf: ["أصدقاء", "تحويل"],
        subCategoryMode: "soft",
      },
    ],
    tags: ["franco"],
  },
  {
    id: "NOI-005",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "dafa3t 200 kahraba",
    expectedItems: [
      { amount: 200, type: "expense", category: "فواتير", subCategory: "كهرباء" },
    ],
    tags: ["franco"],
  },
  {
    id: "NOI-006",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "دفعت دفعت 200 بنزين",
    expectedItems: [
      { amount: 200, type: "expense", category: "مواصلات", subCategory: "بنزين" },
    ],
    tags: ["stt_doubled_word"],
    note: "تكرار الفعل من تفريغ الصوت — يجب ألا يُنتج عمليتين",
  },
  {
    id: "NOI-007",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "جبت هدوم ب اربعتلاف جنيه",
    expectedItems: [
      { amount: 4000, type: "expense", category: "تسوق", subCategory: "ملابس" },
    ],
    tags: ["run_together_number"],
  },
  {
    id: "NOI-008",
    bucket: "noise_stt_franco",
    tier: "locked",
    text: "اشتريت اكل للقطه ب مئة وعشرين جنيه من عند البيطرى",
    expectedItems: [
      {
        amount: 120,
        type: "expense",
        category: "حيوانات أليفة",
        categoryAnyOf: ["حيوانات أليفة"],
        subCategoryMode: "soft",
      },
    ],
    tags: ["stt_ta_marbuta", "stt_alef_maqsura", "pets", "word_number"],
  },
];
