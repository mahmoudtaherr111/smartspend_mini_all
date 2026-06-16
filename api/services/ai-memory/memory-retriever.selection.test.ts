import { selectMemoryCandidatesForFacts } from "./memory-retriever";
import type { RetrievedMemory } from "./types";

function item(
  id: string,
  source: RetrievedMemory["source"],
  content: string,
  score: number,
): RetrievedMemory {
  return {
    id,
    type: source === "action" ? "action" : source === "capsule" ? "summary" : "plan",
    content,
    score,
    importance: 50,
    source,
    createdAt: new Date("2026-06-15T00:00:00Z"),
  };
}

describe("memory retriever candidate selection", () => {
  it("drops noisy capsules from selected facts when direct semantic memories match", () => {
    const selected = selectMemoryCandidatesForFacts(
      "coffee sleep plan",
      {
        memories: [item("memory_1", "memory", "coffee sleep plan: reduce late coffee for one week", 0.8)],
        capsules: [item("capsule_1", "capsule", "coffee sleep plan plus generated finance answer", 1.4)],
        actions: [item("action_1", "action", "goal.create: coffee saving action draft", 0.7)],
      },
      5,
    );

    expect(selected.map((entry) => entry.source)).toEqual(["memory", "action"]);
  });

  it("keeps capsules when no direct semantic memory is available", () => {
    const selected = selectMemoryCandidatesForFacts(
      "coffee sleep plan",
      {
        memories: [],
        capsules: [item("capsule_1", "capsule", "coffee sleep plan from old chat", 0.9)],
        actions: [],
      },
      5,
    );

    expect(selected.map((entry) => entry.source)).toEqual(["capsule"]);
  });
});
