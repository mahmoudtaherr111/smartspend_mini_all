/** Diagnostic challenge, NOT the release gate and NOT a hidden holdout. Fails visibly on unsolved cases. */
import { beforeAll,it,expect,vi } from "vitest";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { notificationToDraft } from "../lib/notification-evidence";
import { receiptEvidenceSchema, receiptEvidenceToDraft } from "../lib/receipt-evidence";
import { runSmartPipeline } from "../lib/smart-pipeline";
import { mapModelName } from "../lib/model-mapper";
vi.mock("../queries/connection",()=>{
  const chain:Record<string,unknown>={};const self=()=>chain;
  Object.assign(chain,{from:self,where:self,orderBy:self,values:self,set:self,limit:async()=>[],then:(r:(a:unknown[])=>unknown)=>Promise.resolve([]).then(r)});
  return {db:{select:self,insert:self,update:self,query:{}},pool:{}};
});
vi.mock("../lib/muscle-memory",()=>({muscleMemoryLookup:async()=>null}));
vi.mock("../lib/ai-gateway",()=>({resolveAdminRoutes:async()=>({preferred:null,routes:[]})}));
vi.mock("../lib/llm-router",async original=>({...await original<object>(),executeLlmChain:async()=>{throw new Error("Offline diagnostic");}}));
type Case={id:string;channel:string;text:string;tags:string[];evidence?:unknown;expected:{amount?:number|null;amounts?:number[];kind?:string|null;status?:string|null;merchant?:string|null;blocked?:boolean}};
const fixturePath=resolve("api/qa/fixtures/journey-challenge-20260906.json");
const fixture=JSON.parse(readFileSync(fixturePath,"utf8")) as {cases:Case[];provenance:string};
const rows:Array<{id:string;channel:string;tags:string[];passed:boolean;expected:Case["expected"];actual:unknown}>=[];
beforeAll(async()=>{
  vi.spyOn(console,"warn").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});
  for(const c of fixture.cases){
    let actual:unknown,passed=false;
    if(c.channel === "notification"){
      const d=notificationToDraft({message:c.text,sender:"Synthetic fixture",timestamp:"2026-09-06T10:00:00Z"});const e=d.events[0];
      actual={amount:e?.amount??null,kind:e?.kind??null,status:e?.status??null,merchant:e?.merchant??null,issues:e?.issues||[],ignored:d.ignoredReason};
      passed=(e?.amount??null)===c.expected.amount&&(e?.kind??null)===c.expected.kind&&(e?.status??null)===c.expected.status;
      if(c.expected.merchant) passed=passed&&e?.merchant===c.expected.merchant;
    }else if(c.channel === "post_ocr_document"){
      const d=receiptEvidenceToDraft(receiptEvidenceSchema.parse(c.evidence));const e=d.events[0];
      const blocked=!!d.issues.length||!!e.issues.length||e.status!=="realized"||e.amount===null||e.currency!=="EGP";
      actual={amount:e.amount,blocked,issues:[...d.issues,...e.issues],status:e.status};
      passed=e.amount===c.expected.amount&&blocked===c.expected.blocked;
    }else{
      const result=await runSmartPipeline({text:c.text,userId:9860600+rows.length,userType:"local",userPlan:"free",userDict:[],apiKey:"",modelName:mapModelName("flash"),maxTokens:512});
      actual={amounts:result.items.map(i=>i.amount),kinds:result.items.map(i=>i.type),categories:result.items.map(i=>i.category),decision:result.decision};
      passed=c.expected.kind==="ambiguous" ? result.decision!=="auto_save" : JSON.stringify(result.items.map(i=>i.amount))===JSON.stringify(c.expected.amounts);
      if(!["mixed","none","ambiguous"].includes(c.expected.kind||"")) passed=passed&&result.items.every(i=>i.type===c.expected.kind);
    }
    rows.push({id:c.id,channel:c.channel,tags:c.tags,expected:c.expected,actual,passed});
  }
  const reportPath=resolve(process.env.JOURNEY_REPORT_PATH || "docs/reviews/implementation/JOURNEY/challenge-results.json");mkdirSync(dirname(reportPath),{recursive:true});
  writeFileSync(reportPath,JSON.stringify({status:"diagnostic",generatedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID || null,runAttempt:process.env.GITHUB_RUN_ATTEMPT || null,commit:process.env.GITHUB_SHA || null,fixtureSha256:createHash("sha256").update(readFileSync(fixturePath)).digest("hex"),
    provenance:fixture.provenance,limitations:["30 text cases are local-only; no live LLM or STT","20 document cases begin after OCR; no image accuracy claim","synthetic notifications are not verified bank templates","pass rate is for the listed facts, not full-record or end-to-end accuracy"],
    total:rows.length,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).map(r=>r.id),rows},null,2));
},60000);
it("evaluates all 100 distinct scenarios without provider calls",()=>{expect(rows).toHaveLength(100);expect(new Set(rows.map(r=>r.id)).size).toBe(100);});
it("reports unsolved scenarios as failures, never as a green quality claim",()=>expect(rows.filter(r=>!r.passed).map(r=>r.id)).toEqual([]));
