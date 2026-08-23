import { performance } from "perf_hooks";

async function main() {
  console.log("==================================================");
  console.log(" 🧪 ACCURATE NVIDIA API RATE LIMIT BENCHMARK      ");
  console.log("==================================================\n");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const model = "meta/llama-3.3-70b-instruct";

  const sendSingleRequest = async (id: number): Promise<{ success: boolean; status: number; durationMs: number; retryAfter?: string; errorText?: string }> => {
    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: `Ping test ${id}` }],
          max_tokens: 5,
          temperature: 0.1,
        }),
      });
      const durationMs = Math.round(performance.now() - start);
      if (res.ok) {
        return { success: true, status: res.status, durationMs };
      } else {
        const retryAfter = res.headers.get("retry-after") || undefined;
        const errorText = await res.text().catch(() => "");
        return { success: false, status: res.status, durationMs, retryAfter, errorText };
      }
    } catch (err: any) {
      return { success: false, status: 0, durationMs: Math.round(performance.now() - start), errorText: err.message };
    }
  };

  // ─── TEST 1: CONCURRENCY BENCHMARK (Simultaneous Parallel Requests) ───
  console.log("--- PHASE 1: TESTING MAX CONCURRENT REQUESTS (Parallel Burst) ---");
  const concurrencyLevels = [1, 3, 5, 10, 15, 20];
  
  for (const burstCount of concurrencyLevels) {
    console.log(`\n🚀 Bursting ${burstCount} parallel requests simultaneously...`);
    const promises = Array.from({ length: burstCount }, (_, i) => sendSingleRequest(i + 1));
    const results = await Promise.all(promises);
    
    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success);
    const avgDuration = Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length);

    console.log(`  -> Results: ${successes}/${burstCount} Successes (Avg Latency: ${avgDuration}ms)`);
    if (failures.length > 0) {
      console.log(`  ❌ Failed Requests Count: ${failures.length}`);
      const firstFail = failures[0];
      console.log(`  ❌ First Fail Status: ${firstFail.status}, Retry-After: ${firstFail.retryAfter || "None"}, Error: ${firstFail.errorText}`);
      break;
    }

    // Small delay between burst tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // ─── TEST 2: SUSTAINED THROUGHTPUT / RPM BENCHMARK ───
  console.log("\n--- PHASE 2: SUSTAINED RPM (Requests Per Minute) BENCHMARK ---");
  console.log("Sending fast requests continuously to find exact 429 threshold...\n");

  let totalSent = 0;
  let totalSuccess = 0;
  let hitRateLimit = false;
  const startTime = performance.now();

  for (let i = 1; i <= 60; i++) {
    totalSent++;
    const res = await sendSingleRequest(totalSent);
    
    if (res.success) {
      totalSuccess++;
      process.stdout.write(`✅ Req #${totalSent} (${res.durationMs}ms) | `);
      if (totalSent % 5 === 0) process.stdout.write("\n");
    } else {
      hitRateLimit = true;
      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`\n\n🛑 RATE LIMIT HIT at Request #${totalSent}!`);
      console.log(`  - Elapsed Time: ${elapsedSec}s`);
      console.log(`  - HTTP Status: ${res.status}`);
      console.log(`  - Retry-After Header: ${res.retryAfter || "Not provided"}`);
      console.log(`  - Error Body: ${res.errorText}`);
      console.log(`  - Exact Successful Capacity Before 429: ${totalSuccess} requests in ${elapsedSec}s`);
      break;
    }
    // 250ms spacing (~4 req/sec = 240 req/min theoretical ceiling)
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const elapsedTotal = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log("\n==================================================");
  console.log(" 📊 BENCHMARK SUMMARY FOR NVIDIA API KEY");
  console.log("==================================================");
  console.log(`Total Requests Sent: ${totalSent}`);
  console.log(`Total Successful:    ${totalSuccess}`);
  console.log(`Elapsed Benchmark:  ${elapsedTotal} seconds`);
  if (!hitRateLimit) {
    console.log("🎉 No Rate Limit (429) hit during the test run!");
    console.log(`Observed Throughput: ~${Math.round((totalSuccess / parseFloat(elapsedTotal)) * 60)} RPM without any errors!`);
  }
}

main().catch(console.error);
