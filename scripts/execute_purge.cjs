const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const cwd = path.resolve(__dirname, "..");
const results = {
  timestamp: new Date().toISOString(),
  steps: {},
  verification: {},
};

function run(name, cmd) {
  console.log(`\n=== Running: ${name} ===`);
  console.log(`$ ${cmd}`);
  try {
    const out = execSync(cmd, { cwd, encoding: "utf-8" });
    results.steps[name] = { success: true, output: out.trim() };
    console.log(out.trim());
    return out;
  } catch (err) {
    results.steps[name] = {
      success: false,
      error: err.message,
      stdout: err.stdout ? err.stdout.toString() : "",
      stderr: err.stderr ? err.stderr.toString() : "",
    };
    console.error(`Error in ${name}:`, err.message);
    if (err.stdout) console.log("stdout:", err.stdout.toString());
    if (err.stderr) console.error("stderr:", err.stderr.toString());
    return null;
  }
}

// 1. Ensure working directory is clean
run("stage_remaining", "git add -A");
run("commit_prep", 'git commit -m "chore(security): finalize gitignore and purge prep" || true');
run("status_pre_purge", "git status");

// 2. Execute git-filter-repo
const filterCmd = "python -m git_filter_repo --invert-paths --path .env --replace-text secret-replacements.txt --force";
run("filter_repo", filterCmd);

// 3. Re-add remote if needed
run("readd_remote", "git remote add origin https://github.com/mahmoudtaherr111/smartspend_mini_all.git || true");

// 4. Clean reflogs and gc prune
run("reflog_expire", "git reflog expire --expire=now --all");
run("gc_prune", "git gc --prune=now");

// 5. Verifications
// Verification A: Check that .env is completely absent from git history
const envLogs = run("verify_env_logs", 'git log --all --full-history --name-only --pretty=format:"commit:%h" -- "**.env*"');
const leakedEnvMatches = (envLogs || "")
  .split("\n")
  .map(l => l.trim())
  .filter(l => l.endsWith(".env") || l.match(/(^|\/)\.env$/));
results.verification.leakedEnvOccurrences = leakedEnvMatches;
results.verification.isEnvPurged = leakedEnvMatches.length === 0;

// Verification B: Check that [REDACTED_KEY_PREFIX] returns 0 matches
const keyLogs = run("verify_key_logs", 'git log --all --oneline -S "[REDACTED_KEY_PREFIX]"');
results.verification.keyMatches = (keyLogs || "").trim();
results.verification.isKeyPurged = (keyLogs || "").trim().length === 0;

// Verification C: Repository health
const repoStatus = run("verify_status", "git status");
const repoLog = run("verify_log_5", "git log -n 5 --oneline");
results.verification.status = repoStatus ? repoStatus.trim() : "";
results.verification.recentCommits = repoLog ? repoLog.trim() : "";

// Write report to .agents/worker_sec_m5/
const reportPath = path.resolve(cwd, ".agents", "worker_sec_m5", "purge_execution_results.json");
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf-8");
console.log(`\nResults written to: ${reportPath}`);

module.exports = results;
