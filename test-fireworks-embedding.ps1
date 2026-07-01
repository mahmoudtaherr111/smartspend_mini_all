$apiKey = "fw_VhH1Bo2oNNd8bjxGEwSXjP"
$model = "accounts/fireworks/models/qwen3-embedding-8b"
$url = "https://api.fireworks.ai/inference/v1/embeddings"
$headers = @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" }

# ═══════════════════════════════════════════════════════════════
# PHASE 1: Category Descriptors (the actual data we'd use)
# ═══════════════════════════════════════════════════════════════

$descriptors = @(
    @{ cat = "أكل وشرب"; sub = "مطعم"; text = "أكلت في مطعم" },
    @{ cat = "أكل وشرب"; sub = "وجبات سريعة"; text = "اشتريت برجر" },
    @{ cat = "أكل وشرب"; sub = "قهوة"; text = "شربت قهوة" },
    @{ cat = "أكل وشرب"; sub = "بقالة"; text = "طلبات سوبرماركت" },
    @{ cat = "مواصلات"; sub = "بنزين"; text = "ملأت بنزين" },
    @{ cat = "مواصلات"; sub = "أوبر"; text = "ركبت اوبر" },
    @{ cat = "مواصلات"; sub = "مترو"; text = "تذكرة مترو" },
    @{ cat = "فواتير"; sub = "كهرباء"; text = "فاتورة الكهرباء" },
    @{ cat = "فواتير"; sub = "إنترنت"; text = "باقة النت" },
    @{ cat = "فواتير"; sub = "شحن"; text = "شحنت رصيد" },
    @{ cat = "سكن"; sub = "إيجار"; text = "دفعت الإيجار" },
    @{ cat = "سكن"; sub = "صيانة"; text = "سباك للبيت" },
    @{ cat = "تسوق"; sub = "ملابس"; text = "اشتريت هدوم" },
    @{ cat = "تسوق"; sub = "إلكترونيات"; text = "موبايل جديد" },
    @{ cat = "صحة"; sub = "دكتور"; text = "كشف دكتور" },
    @{ cat = "صحة"; sub = "صيدلية"; text = "دوا من الصيدلية" },
    @{ cat = "تعليم"; sub = "مدرسة"; text = "مصاريف المدرسة" },
    @{ cat = "تعليم"; sub = "كورس"; text = "كورس جديد" },
    @{ cat = "ترفيه"; sub = "سينما"; text = "تذكرة سينما" },
    @{ cat = "ترفيه"; sub = "جيم"; text = "اشتراك الجيم" },
    @{ cat = "تدخين"; sub = "سجائر"; text = "علبة سجاير" },
    @{ cat = "هدايا"; sub = "صدقة"; text = "تبرعت للجامع" },
    @{ cat = "استثمار"; sub = "ذهب"; text = "اشتريت ذهب" },
    @{ cat = "تحويل"; sub = "انستاباي"; text = "تحويل انستاباي" },
    @{ cat = "تحويل"; sub = "سحب"; text = "سحبت من ATM" },
    @{ cat = "مرتب"; sub = "راتب"; text = "قبضت المرتب" }
)

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Real user queries (what users actually type)
# ═══════════════════════════════════════════════════════════════

$queries = @(
    @{ expected = "أكل وشرب"; text = "دفعت 200 على الفطار" },
    @{ expected = "أكل وشرب"; text = "اكلت بيتزا ب 150" },
    @{ expected = "أكل وشرب"; text = "شربت قهوة 35" },
    @{ expected = "أكل وشرب"; text = "طلبات البيت 300" },
    @{ expected = "مواصلات"; text = "بنزين 500" },
    @{ expected = "مواصلات"; text = "ركبت اوبر 80" },
    @{ expected = "مواصلات"; text = "مترو 10" },
    @{ expected = "فواتير"; text = "كهربا 450" },
    @{ expected = "فواتير"; text = "باقة النت 360" },
    @{ expected = "فواتير"; text = "شحنت رصيد 100" },
    @{ expected = "سكن"; text = "الإيجار 5000" },
    @{ expected = "سكن"; text = "السباك 250" },
    @{ expected = "تسوق"; text = "هدوم 900" },
    @{ expected = "تسوق"; text = "اشتريت ايفون" },
    @{ expected = "صحة"; text = "كشف 400" },
    @{ expected = "صحة"; text = "دوا 260" },
    @{ expected = "تعليم"; text = "مدرسة 1200" },
    @{ expected = "ترفيه"; text = "سينما 180" },
    @{ expected = "تدخين"; text = "سجاير 65" },
    @{ expected = "هدايا"; text = "صدقة 100" },
    @{ expected = "استثمار"; text = "ذهب 6000" },
    @{ expected = "تحويل"; text = "انستاباي 1000" },
    @{ expected = "مرتب"; text = "المرتب 15000" }
)

# ═══════════════════════════════════════════════════════════════
# Helper: Get embeddings from Fireworks
# ═══════════════════════════════════════════════════════════════

function Get-Embeddings($texts, $dims = $null) {
    $body = @{ model = $model; input = $texts }
    if ($dims) { $body.dimensions = $dims }
    $bodyJson = $body | ConvertTo-Json -Depth 5
    $resp = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $bodyJson -UseBasicParsing
    $data = $resp.Content | ConvertFrom-Json
    return $data.data | ForEach-Object { $_.embedding }
}

function Cos-Sim($a, $b) {
    $dot = 0; $na = 0; $nb = 0
    for ($i = 0; $i -lt $a.Count; $i++) { $dot += $a[$i] * $b[$i]; $na += $a[$i] * $a[$i]; $nb += $b[$i] * $b[$i] }
    $denom = [math]::Sqrt($na) * [math]::Sqrt($nb)
    if ($denom -eq 0) { return 0 }
    return [math]::Round($dot / $denom, 4)
}

# ═══════════════════════════════════════════════════════════════
# PHASE 3: Build descriptor embeddings (raw Arabic, no instruct)
# ═══════════════════════════════════════════════════════════════

Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "PHASE A: Raw Arabic (no instruct prefix)"
Write-Output "═══════════════════════════════════════════════════════════"

$descTexts = $descriptors | ForEach-Object { $_.text }
$descEmbeddings = Get-Embeddings $descTexts
Write-Output "Descriptor embeddings: $($descEmbeddings.Count) x $($descEmbeddings[0].Count) dims"

$queryTexts = $queries | ForEach-Object { $_.text }
$queryEmbeddings = Get-Embeddings $queryTexts
Write-Output "Query embeddings: $($queryEmbeddings.Count)"

# Test classification accuracy
$correctRaw = 0
$total = $queries.Count
Write-Output ""
Write-Output "=== Classification Results (Raw Arabic) ==="
for ($qi = 0; $qi -lt $total; $qi++) {
    $bestCat = ""
    $bestSim = -1
    $bestSub = ""
    for ($di = 0; $di -lt $descriptors.Count; $di++) {
        $sim = Cos-Sim $queryEmbeddings[$qi] $descEmbeddings[$di]
        if ($sim -gt $bestSim) {
            $bestSim = $sim
            $bestCat = $descriptors[$di].cat
            $bestSub = $descriptors[$di].sub
        }
    }
    $expected = $queries[$qi].expected
    $isCorrect = $bestCat -eq $expected
    if ($isCorrect) { $correctRaw++ }
    $mark = if ($isCorrect) { "OK " } else { "XX " }
    Write-Output "$mark query='$($queries[$qi].text)' -> best=$bestCat/$bestSub ($bestSim) expected=$expected"
}
$accRaw = [math]::Round(($correctRaw / $total) * 100, 1)
Write-Output ""
Write-Output ">>> RAW ACCURACY: $correctRaw / $total = $accRaw%"

# ═══════════════════════════════════════════════════════════════
# PHASE 4: Build with Instruct prefix
# ═══════════════════════════════════════════════════════════════

Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "PHASE B: With Instruct Prefix"
Write-Output "═══════════════════════════════════════════════════════════"

$instructPrefix = "Instruct: Classify the financial category of this Arabic text. Query: "
$descTextsInstr = $descriptors | ForEach-Object { "$instructPrefix $($_.text)" }
$descEmbeddingsInstr = Get-Embeddings $descTextsInstr

$queryTextsInstr = $queries | ForEach-Object { "$instructPrefix $($_.text)" }
$queryEmbeddingsInstr = Get-Embeddings $queryTextsInstr

$correctInstr = 0
Write-Output ""
Write-Output "=== Classification Results (Instruct Prefix) ==="
for ($qi = 0; $qi -lt $total; $qi++) {
    $bestCat = ""
    $bestSim = -1
    for ($di = 0; $di -lt $descriptors.Count; $di++) {
        $sim = Cos-Sim $queryEmbeddingsInstr[$qi] $descEmbeddingsInstr[$di]
        if ($sim -gt $bestSim) {
            $bestSim = $sim
            $bestCat = $descriptors[$di].cat
        }
    }
    $expected = $queries[$qi].expected
    $isCorrect = $bestCat -eq $expected
    if ($isCorrect) { $correctInstr++ }
    $mark = if ($isCorrect) { "OK " } else { "XX " }
    Write-Output "$mark query='$($queries[$qi].text)' -> best=$bestCat ($bestSim) expected=$expected"
}
$accInstr = [math]::Round(($correctInstr / $total) * 100, 1)
Write-Output ""
Write-Output ">>> INSTRUCT ACCURACY: $correctInstr / $total = $accInstr%"

# ═══════════════════════════════════════════════════════════════
# PHASE 5: With dimension reduction (256)
# ═══════════════════════════════════════════════════════════════

Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "PHASE C: Raw Arabic + dimensions=256"
Write-Output "═══════════════════════════════════════════════════════════"

$descEmbeddings256 = Get-Embeddings $descTexts 256
$queryEmbeddings256 = Get-Embeddings $queryTexts 256
Write-Output "Dim: $($descEmbeddings256[0].Count)"

$correct256 = 0
for ($qi = 0; $qi -lt $total; $qi++) {
    $bestCat = ""
    $bestSim = -1
    for ($di = 0; $di -lt $descriptors.Count; $di++) {
        $sim = Cos-Sim $queryEmbeddings256[$qi] $descEmbeddings256[$di]
        if ($sim -gt $bestSim) {
            $bestSim = $sim
            $bestCat = $descriptors[$di].cat
        }
    }
    $expected = $queries[$qi].expected
    if ($bestCat -eq $expected) { $correct256++ }
}
$acc256 = [math]::Round(($correct256 / $total) * 100, 1)
Write-Output ">>> 256-DIM ACCURACY: $correct256 / $total = $acc256%"

# ═══════════════════════════════════════════════════════════════
# PHASE 6: Intra-category vs Inter-category separation
# ═══════════════════════════════════════════════════════════════

Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "PHASE D: Separation Analysis (Raw Arabic)"
Write-Output "═══════════════════════════════════════════════════════════"

# Same-category pairs
$sameCatSims = @()
for ($i = 0; $i -lt $descriptors.Count; $i++) {
    for ($j = $i + 1; $j -lt $descriptors.Count; $j++) {
        if ($descriptors[$i].cat -eq $descriptors[$j].cat) {
            $sameCatSims += (Cos-Sim $descEmbeddings[$i] $descEmbeddings[$j])
        }
    }
}

# Different-category pairs
$diffCatSims = @()
for ($i = 0; $i -lt $descriptors.Count; $i++) {
    for ($j = $i + 1; $j -lt $descriptors.Count; $j++) {
        if ($descriptors[$i].cat -ne $descriptors[$j].cat) {
            $diffCatSims += (Cos-Sim $descEmbeddings[$i] $descEmbeddings[$j])
        }
    }
}

$avgSame = if ($sameCatSims.Count -gt 0) { [math]::Round(($sameCatSims | Measure-Object -Average).Average, 4) } else { 0 }
$avgDiff = if ($diffCatSims.Count -gt 0) { [math]::Round(($diffCatSims | Measure-Object -Average).Average, 4) } else { 0 }
$minDiff = if ($diffCatSims.Count -gt 0) { [math]::Round(($diffCatSims | Measure-Object -Minimum).Minimum, 4) } else { 0 }
$maxDiff = if ($diffCatSims.Count -gt 0) { [math]::Round(($diffCatSims | Measure-Object -Maximum).Maximum, 4) } else { 0 }
$gap = [math]::Round($avgSame - $avgDiff, 4)

Write-Output "Same-category avg similarity:  $avgSame ($($sameCatSims.Count) pairs)"
Write-Output "Diff-category avg similarity:  $avgDiff ($($diffCatSims.Count) pairs)"
Write-Output "Diff-category min similarity:  $minDiff"
Write-Output "Diff-category max similarity:  $maxDiff"
Write-Output "Separation gap (same - diff):  $gap"
Write-Output ""
if ($gap -lt 0.05) {
    Write-Output ">>> VERDICT: POOR separation (gap < 0.05) — model cannot distinguish Arabic categories"
} elseif ($gap -lt 0.15) {
    Write-Output ">>> VERDICT: WEAK separation (gap < 0.15) — unreliable for classification"
} elseif ($gap -lt 0.25) {
    Write-Output ">>> VERDICT: MODERATE separation — usable but with high error rate"
} else {
    Write-Output ">>> VERDICT: GOOD separation — model can distinguish categories"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 7: Final Summary
# ═══════════════════════════════════════════════════════════════

Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "FINAL SUMMARY"
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "Raw Arabic accuracy:     $accRaw%"
Write-Output "Instruct prefix accuracy: $accInstr%"
Write-Output "256-dim accuracy:        $acc256%"
Write-Output "Separation gap:          $gap"
Write-Output ""
Write-Output "Rule engine accuracy:    ~80% (current local, 0 API calls)"
Write-Output ""
if ($accRaw -ge 80 -and $gap -ge 0.15) {
    Write-Output ">>> RECOMMENDATION: USE Fireworks embedding (beats or matches rule engine)"
} elseif ($accRaw -ge 70) {
    Write-Output ">>> RECOMMENDATION: MAYBE — test with more data, borderline accuracy"
} else {
    Write-Output ">>> RECOMMENDATION: REJECT — local engine is better and free"
}
