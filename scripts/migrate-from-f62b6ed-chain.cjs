const { spawn } = require('node:child_process');

const migrationScripts = [
  'db:migrate-remove-event-description',
  'db:migrate-remove-event-extra-fields',
  'db:migrate-feeding-days-to-array',
  'db:migrate-sync-feeding-reminders',
  'db:migrate-remove-expense-legacy-fields',
  'db:migrate-remove-health-record-legacy-fields',
  'db:migrate-recurrence-enddate-boundary',
];

function runNpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', scriptName], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptName} failed with exit code ${code}`));
    });
  });
}

async function runMigrationChain() {
  console.log('Starting migration chain for commits from f62b6ed onwards...');

  for (const scriptName of migrationScripts) {
    console.log(`\n>>> Running ${scriptName}`);
    await runNpmScript(scriptName);
  }

  console.log('\nAll migrations completed successfully.');
}

runMigrationChain().catch((error) => {
  console.error('\nMigration chain failed:', error);
  process.exit(1);
});
