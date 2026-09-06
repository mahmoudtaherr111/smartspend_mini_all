CREATE TABLE `financial_captures` (
  `id` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `user_type` varchar(50) NOT NULL,
  `request_key` varchar(64) NOT NULL,
  `source_hash` varchar(64) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `state` varchar(20) NOT NULL DEFAULT 'review',
  `draft` json NOT NULL,
  `receipt` json,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `capture_owner_request_unique` (`user_id`, `user_type`, `request_key`),
  KEY `capture_owner_state_idx` (`user_id`, `user_type`, `state`),
  KEY `capture_expiry_idx` (`expires_at`)
);
