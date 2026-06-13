import json
import os

base_dir = r"e:\smartspend_V1_fixed\api\lib"
files = [
    os.path.join(base_dir, "egypt_merchants_rag.json"),
    os.path.join(base_dir, "egypt_slang_local_rag.json"),
    os.path.join(base_dir, "egypt_digital_fintech_rag.json")
]

# We will merge all data into a dict indexed by merchant name (case-insensitive)
merged = {}

for file_path in files:
    if not os.path.exists(file_path):
        print(f"Skipping missing file: {file_path}")
        continue
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for entry in data:
                merchant = entry.get("merchant")
                if not merchant:
                    continue
                # Key for merging
                key = merchant.strip().lower()
                
                cat = entry.get("category", "Services")
                sub_cat = entry.get("subCategory", "General")
                is_inst = entry.get("isInstallmentCommon", False)
                keywords = entry.get("keywords", [])
                
                # Normalize keywords to list of clean strings
                clean_kws = []
                for kw in keywords:
                    if isinstance(kw, str) and kw.strip():
                        clean_kws.append(kw.strip())
                
                if key in merged:
                    # Merge keywords
                    existing = merged[key]
                    merged_kw = list(set(existing["keywords"] + clean_kws))
                    existing["keywords"] = merged_kw
                    # Installment matches if either is true
                    existing["isInstallmentCommon"] = existing["isInstallmentCommon"] or is_inst
                else:
                    merged[key] = {
                        "merchant": merchant,
                        "category": cat,
                        "subCategory": sub_cat,
                        "keywords": list(set(clean_kws)),
                        "isInstallmentCommon": is_inst
                    }
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

# Convert back to list
consolidated = list(merged.values())
output_path = os.path.join(base_dir, "egypt_merchants_rag.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(consolidated, f, ensure_ascii=False, indent=2)

print(f"SUCCESS: Consolidated {len(consolidated)} unique merchants into {output_path}")
