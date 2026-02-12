-- Initialize default configuration
-- Sets Cloudflare AI as the default provider for backward compatibility

INSERT OR IGNORE INTO config (key, value) VALUES ('ai_provider', 'cloudflare');
INSERT OR IGNORE INTO config (key, value) VALUES ('ai_model', 'llama-3.3-70b');
INSERT OR IGNORE INTO config (key, value) VALUES ('ai_vision_model', 'llama-4-scout');
