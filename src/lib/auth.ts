import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';
import { expo } from '@better-auth/expo';

// Create MongoDB client
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('MONGODB_URI is required');
}
const client = new MongoClient(mongoUri);
const db = client.db(); // Uses database name from connection string

const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret) {
  throw new Error('BETTER_AUTH_SECRET is required');
}

const authBaseUrl = process.env.BETTER_AUTH_URL;
if (!authBaseUrl) {
  throw new Error('BETTER_AUTH_URL is required');
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const appleClientId = process.env.APPLE_CLIENT_ID;
const appleClientSecret = process.env.APPLE_CLIENT_SECRET;
const facebookClientId = process.env.FACEBOOK_CLIENT_ID;
const facebookClientSecret = process.env.FACEBOOK_CLIENT_SECRET;

export const auth: ReturnType<typeof betterAuth> = betterAuth({
  database: mongodbAdapter(db, {
    client,
    usePlural: false,
    transaction: false, // Disable transactions for standalone MongoDB
  }),
  secret: authSecret,
  baseURL: authBaseUrl,
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
    ...(appleClientId && appleClientSecret
      ? {
          apple: {
            clientId: appleClientId,
            clientSecret: appleClientSecret,
          },
        }
      : {}),
    ...(facebookClientId && facebookClientSecret
      ? {
          facebook: {
            clientId: facebookClientId,
            clientSecret: facebookClientSecret,
          },
        }
      : {}),
  },
  // Enhanced trustedOrigins with mobile app support
  trustedOrigins: [
    'http://localhost:8081',
    'http://localhost:3000',
    'capacitor://localhost',
    'petopia://',
    'petopia-petcare://',
    'petopia-petcare:///', // iOS style
    'https://appleid.apple.com',
    // Expo development URLs with wildcards
    ...(process.env.NODE_ENV === 'development'
      ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**']
      : []),
  ],
  emailAndPassword: {
    enabled: false,
  },

  // Add Expo plugin for mobile support
  plugins: [
    expo(),
    // Your existing plugins (apiKey, admin, etc.)
  ],
  rateLimit: {
    storage: 'database', // Uses MongoDB for rate limiting storage
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

// Make sure to export the client for reuse
export { client };

// Export auth type for type inference
export type Auth = typeof auth;
