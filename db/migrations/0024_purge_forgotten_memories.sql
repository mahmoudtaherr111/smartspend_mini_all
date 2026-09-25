-- "Forget" used to keep a memory's text with status 'forgotten'. It now deletes it; this removes the ones kept before.
DELETE FROM `ai_memory_embeddings` WHERE `memory_item_id` IN (SELECT `id` FROM `ai_memory_items` WHERE `status` = 'forgotten');--> statement-breakpoint
DELETE FROM `ai_memory_items` WHERE `status` = 'forgotten';
