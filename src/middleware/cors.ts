import cors from 'cors';

// Allow multiple origins for development (web app + mobile app)
const allowedOrigins = [
  'http://localhost:3001', // Next.js web app
  'http://localhost:8081', // Expo mobile app
  'https://appleid.apple.com', // Sign in with Apple callbacks
  'https://dev.dekadans.net', // Dev web
  'https://petopiaapi.dekadans.net', // API domain
  'https://petopia.app', // Prod web
  'petopia://', // iOS mobile
  'petopia-petcare://', // Android mobile
  process.env.CORS_ORIGIN, // Custom origin from env
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // CORS blocked origin: ${origin}
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

export const corsMiddleware = cors(corsOptions);
