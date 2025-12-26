#!/usr/bin/env node

/**
 * Cursor hook to block destructive git, GitHub CLI, and shell operations.
 * Uses an array of patterns for readability and maintainability.
 */

const DESTRUCTIVE_PATTERNS = [
  // ============ Git Operations ============
  /\bgit\s+push\b.*--delete\b/, // git push --delete
  /\bgit\s+push\b.*\s:[^\s]+/, // git push origin :branch (delete via refspec)
  /\bgit\s+push\b.*\s-f\b/, // git push -f
  /\bgit\s+push\b.*--force\b/, // git push --force or --force-with-lease
  /\bgit\s+push\b.*--mirror\b/, // git push --mirror
  /\bgit\s+push\b.*--prune\b/, // git push --prune
  /\bgit\s+branch\b.*\s-[dD]\b/, // git branch -d or -D
  /\bgit\s+tag\b.*\s-(d|-delete)\b/, // git tag -d or --delete
  /\bgit\s+remote\b.*\sremove\b/, // git remote remove
  /\bgit\s+rm\b/, // git rm
  /\bgit\s+reset\b.*--hard\b/, // git reset --hard
  /\bgit\s+clean\b.*-[fdxX]/, // git clean -f, -d, -x, -X
  /\bgit\s+stash\b.*\s(drop|clear)\b/, // git stash drop/clear
  /\bgit\b.*--force\b/, // any git command with --force

  // ============ GitHub CLI ============
  /\bgh\s+(repo|release|tag|pr|branch)\s+delete\b/, // gh <resource> delete
  /\bgh\s+api\b.*(-X|--method)\s+DELETE\b/, // gh api -X DELETE
  /\bgh\s+api\b.*DELETE.*(refs\/heads|refs\/tags)/, // gh api DELETE refs
  /\bgh\s+api\b.*(refs\/heads|refs\/tags).*DELETE/, // gh api refs DELETE
  /\bgh\s+pr\s+merge\b.*--force\b/, // gh pr merge --force
  /\bgh\b.*--force\b/, // any gh command with --force

  // ============ Destructive Shell Commands ============
  /\brm\s+(-[rRf]+\s+)*-[rRf]*[rR][fF]*\b/, // rm -rf, rm -fr, rm -r -f
  /\brm\b.*--no-preserve-root\b/, // rm --no-preserve-root
  /\bfind\b.*-delete\b/, // find ... -delete
  /\bfind\b.*-exec\s+rm\b/, // find ... -exec rm
  /\bdd\b.*of=\/dev\/(sd|disk)/, // dd of=/dev/sda or /dev/disk
  /\bshred\b/, // shred
  /\bwipe\b/, // wipe
  /\bsrm\b/, // srm (secure remove)
  /\btruncate\b.*-s\s*0\b/, // truncate -s 0
];

/**
 * Check if a command matches any destructive pattern
 */
function isDestructive(command) {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Write to log file for debugging
 */
function writeLog(message) {
  const fs = require('fs');
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync('/tmp/prevent-destructive-git.log', logMessage);
  } catch {
    // Fail silently if logging fails
  }
}

/**
 * Send JSON response to Cursor
 */
function respond(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// Read stdin and handle decisioning
let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    const command =
      data && typeof data.command === 'string' ? data.command : '';

    if (isDestructive(command)) {
      writeLog(`BLOCKED: '${command}'`);
      respond({
        continue: true,
        permission: 'deny',
        user_message: `Destructive operation blocked: ${command}`,
        agent_message:
          `The command '${command}' was blocked because it performs a destructive ` +
          `operation that could permanently delete or overwrite data. ` +
          `If you need to run this command, please execute it manually in your terminal.`,
      });
    } else {
      writeLog(`ALLOWED: '${command}'`);
      respond({ continue: true, permission: 'allow' });
    }
  } catch (err) {
    // On error, allow to avoid breaking workflow
    writeLog(`ERROR (allowing): ${err?.message || err}`);
    respond({ continue: true, permission: 'allow' });
  }
});
