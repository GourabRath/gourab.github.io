require('dotenv').config();
const bcrypt = require('bcryptjs');
const { normalizeEmail, validatePassword } = require('./security');
const { createAccountWithProfile } = require('./graphql/resolvers');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const email = normalizeEmail(process.env.SUPERADMIN_EMAIL);
  const rawPassword = validatePassword(process.env.SUPERADMIN_PASSWORD);
  const password = await bcrypt.hash(rawPassword, 12);
  const account = await createAccountWithProfile({
    email,
    password,
    role: 'SUPERADMIN',
    prefix: 'A',
  });
  console.info(`Created initial superadmin ${account.user.publicId}.`);
}

main().catch(() => {
  console.error('Superadmin bootstrap failed. Check configuration and whether the account already exists.');
  process.exitCode = 1;
});
