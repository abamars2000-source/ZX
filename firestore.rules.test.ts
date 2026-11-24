import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dirty Dozen verification harness for ZX Firestore security rules.
 * Validates structural guarantees and blueprint synchronicity directly against firestore.rules.
 */
export function runDirtyDozenAudit() {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
  const rules = fs.readFileSync(rulesPath, 'utf-8');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

  // 1. Default deny catch-all
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);

  // 2. Email verification gate
  assert.match(rules, /request\.auth\.token\.email_verified == true/);

  // 3-4. Owner + path variable enforcement
  assert.match(rules, /function isOwner\(userId\)/);
  assert.match(rules, /isValidId\(threadId\)/);

  // 5. Strict PII isolation
  assert.match(rules, /match \/private\/\{docId\}[\s\S]*?allow get: if isValidId\(userId\) && isValidId\(docId\) && \(isOwner\(userId\) \|\| isAdmin\(\)\);[\s\S]*?allow list: if false;/);

  // 6. Shadow field rejection via hasAll + hasOnly
  assert.match(rules, /keys\(\)\.hasAll/);
  assert.match(rules, /keys\(\)\.hasOnly/);

  // 7. Master Gate relational check on thread messages
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\/aiThreads\/\$\(threadId\)\)\.data\.ownerId == userId/);

  // 8. ID Poisoning Regex Guard
  assert.match(rules, /\^\[a-zA-Z0-9_\\\\-\]\+\$/);

  // 9-10. Server timestamp & immutability checks
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);

  // 11. Volumetric bounds synced with blueprint
  const maxContent = blueprint.entities.AiMessage.properties.content.maxLength;
  assert.ok(rules.includes(`<= ${maxContent}`), `Rules must enforce max content length ${maxContent}`);

  // 12. Admin table lock
  assert.match(rules, /match \/admins\/\{adminId\}[\s\S]*?allow create: if isAdmin\(\)/);

  return { passed: 12, total: 12 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runDirtyDozenAudit();
  console.log(`Dirty Dozen Firestore rules audit passed: ${result.passed}/${result.total}`);
}
