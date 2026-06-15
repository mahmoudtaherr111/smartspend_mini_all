import { extractPeople } from "./api/lib/entity-extractor";

function test() {
  const text = "اديت يحيى 500 جنيه واديت منه 200 جنيه واديت علاء 600 جنيه";
  const people = extractPeople(text, []);
  console.log(people);
}
test();
