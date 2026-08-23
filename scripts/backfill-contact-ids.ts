import { db } from "../api/queries/connection";
import { expenses, userContacts } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { normalizePersonLookup } from "../api/lib/fuzzy-match"; // fuzzy matching helper

// Run using: npx tsx scripts/backfill-contact-ids.ts [preview|execute|rollback]

async function run() {
  const mode = process.argv[2] || "preview";
  if (!["preview", "execute", "rollback"].includes(mode)) {
    console.error("Invalid mode. Use: preview | execute | rollback");
    process.exit(1);
  }

  console.log(`[Backfill] Starting backfill script in mode: ${mode.toUpperCase()}`);

  if (mode === "rollback") {
    // Revert contactId for rows updated by the script. 
    // We can identify them by checking classification_log_id or updating metadata,
    // or simply finding all expenses that were modified. To make it precise,
    // we search for updates where we logged. Let's do a safe prompt-based rollback if needed.
    // For safety, we can store backup state or log which IDs were modified.
    console.log("[Rollback] To rollback, we reset contact_id to NULL where it was updated.");
    console.log("[Rollback] Warning: rollback will set ALL expenses with contact_id to NULL if they matched.");
    const [result] = await db
      .update(expenses)
      .set({ contactId: null })
      .where(and(eq(expenses.source, "backfill_script"))); // using a dummy field or source tag
    console.log(`[Rollback] Reverted ${(result as any)?.affectedRows || 0} rows.`);
    return;
  }

  // Load all contacts
  const contacts = await db
    .select({
      id: userContacts.id,
      userId: userContacts.userId,
      userType: userContacts.userType,
      name: userContacts.name,
      aliases: userContacts.aliases
    })
    .from(userContacts);

  console.log(`[Backfill] Loaded ${contacts.length} contacts.`);

  // Load expenses that have contactId as NULL
  const unlinkedExpenses = await db
    .select({
      id: expenses.id,
      userId: expenses.userId,
      userType: expenses.userType,
      description: expenses.description,
      rawText: expenses.rawText
    })
    .from(expenses)
    .where(isNull(expenses.contactId));

  console.log(`[Backfill] Loaded ${unlinkedExpenses.length} unlinked expenses.`);

  let matchedCount = 0;
  const updates: Array<{ expenseId: number; contactId: number; description: string; contactName: string; confidence: number }> = [];

  for (const exp of unlinkedExpenses) {
    const textToMatch = exp.description || exp.rawText || "";
    if (!textToMatch) continue;

    // Filter contacts belonging to the same user
    const userContactsList = contacts.filter(
      c => c.userId === exp.userId && c.userType === exp.userType
    );

    let bestMatch: { contactId: number; contactName: string; confidence: number } | null = null;

    for (const contact of userContactsList) {
      const normalizedName = normalizePersonLookup(contact.name);
      const normalizedText = normalizePersonLookup(textToMatch);

      // Check if contact name or any alias is mentioned in the description
      let matched = normalizedText.includes(normalizedName);
      let confidence = 85; // baseline

      if (!matched && contact.aliases) {
        const aliases = Array.isArray(contact.aliases) 
          ? contact.aliases 
          : typeof contact.aliases === "string" 
            ? JSON.parse(contact.aliases) 
            : [];
            
        for (const alias of aliases) {
          const normalizedAlias = normalizePersonLookup(String(alias));
          if (normalizedAlias && normalizedText.includes(normalizedAlias)) {
            matched = true;
            confidence = 80; // slightly lower for alias match
            break;
          }
        }
      }

      if (matched) {
        if (!bestMatch || normalizedName.length > normalizePersonLookup(bestMatch.contactName).length) {
          bestMatch = {
            contactId: contact.id,
            contactName: contact.name,
            confidence
          };
        }
      }
    }

    if (bestMatch) {
      updates.push({
        expenseId: exp.id,
        contactId: bestMatch.contactId,
        description: textToMatch,
        contactName: bestMatch.contactName,
        confidence: bestMatch.confidence
      });
      matchedCount++;
    }
  }

  console.log(`\n[Backfill] Found ${updates.length} potential matches.`);

  if (mode === "preview") {
    console.log("\n--- Preview Matches ---");
    for (const update of updates.slice(0, 50)) {
      console.log(`Expense ID: ${update.expenseId} | Text: "${update.description}" => Contact: "${update.contactName}" (ID: ${update.contactId}) [Confidence: ${update.confidence}%]`);
    }
    if (updates.length > 50) {
      console.log(`... and ${updates.length - 50} more.`);
    }
    console.log("\n[Preview] Done. Run with 'execute' to apply changes.");
  } else if (mode === "execute") {
    console.log("\n--- Executing updates ---");
    let successCount = 0;
    for (const update of updates) {
      try {
        await db
          .update(expenses)
          .set({ 
            contactId: update.contactId,
            source: "backfill_script" // tagging source for rollback capability
          })
          .where(eq(expenses.id, update.expenseId));
        successCount++;
      } catch (err: any) {
        console.error(`Failed to update expense ${update.expenseId}:`, err.message);
      }
    }
    console.log(`[Execute] Successfully updated ${successCount} expenses.`);
  }
}

run().catch(console.error);
