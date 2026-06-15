import { resolvePersonForTransaction } from "./api/lib/person-resolver";

function test() {
  const text = "اديت يحيى 500 جنيه واديت منه 200 جنيه واديت علاء 600 جنيه";
  console.log("يحيى:", resolvePersonForTransaction({ candidateName: "يحيى", transactionText: text, originalText: text, knownPeople: [] }).needsClarification);
  console.log("منه:", resolvePersonForTransaction({ candidateName: "منه", transactionText: text, originalText: text, knownPeople: [] }).needsClarification);
  console.log("علاء:", resolvePersonForTransaction({ candidateName: "علاء", transactionText: text, originalText: text, knownPeople: [] }).needsClarification);
}
test();
