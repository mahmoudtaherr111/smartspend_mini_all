import { extractExplicitPeopleContext } from "./api/lib/person-resolver";

const text = "(احمد صاحبي، قني اخويا)";
console.log(extractExplicitPeopleContext(text));
