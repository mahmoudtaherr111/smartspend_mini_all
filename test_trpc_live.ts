import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "./api/server"; // assuming server exports AppRouter

// We can also just use fetch to test the endpoint directly.
async function test() {
  const url = "http://localhost:3000/api/trpc/ai.parseExpense";
  const body = {
    "0": {
      text: "اديت سلوى 30 جنيه. (صحبتي)",
      inputChannel: "text",
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}

test();
