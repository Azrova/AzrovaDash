import 'express-session';

declare global {
  namespace Express {
    interface SessionData {
      user?: {
        id: number;
        username: string;
        email: string;
        password: string;
        isAdmin: boolean;
      };
    }
  }
}

export {};
