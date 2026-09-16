import type { Session, User } from 'better-auth';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        session: Session;
        user: User;
      };
    }
  }
}

export {};
