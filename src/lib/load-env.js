/**
 * Force-loads .env.local with override: true so that shell environment
 * variables with empty values (e.g. ANTHROPIC_API_KEY="") don't win over
 * the values defined in .env.local.
 *
 * Import this at the top of any lib file that uses API keys.
 */
const path = require('path');
const { config } = require('dotenv');

config({ path: path.join(process.cwd(), '.env.local'), override: true });
