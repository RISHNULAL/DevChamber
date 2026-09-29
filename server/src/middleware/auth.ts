import type { Request, Response, NextFunction } from 'express';
import { verifyToken, getUserById } from '../services/auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role: 'teacher' | 'student' | 'admin';
        name: string;
      };
    }
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // 1. Check JWT token
  const decoded = verifyToken(token);
  if (decoded) {
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };
    return next();
  }

  // 2. Fallback for demo tokens if any (e.g. demo:userId:role:name)
  if (token.startsWith('demo:') || token.startsWith('demo-') || token === 'demo') {
    let userId = 'teacher-alex-uuid-000000000001';
    let role: 'teacher' | 'student' | 'admin' = 'teacher';
    let name = 'Alex Morgan';

    if (token.includes(':')) {
      const parts = token.split(':');
      userId = parts[1] || userId;
      role = (parts[2] as 'teacher' | 'student') || role;
      name = parts[3] ? decodeURIComponent(parts[3]) : name;
    } else if (token.startsWith('demo-')) {
      const parts = token.split('-');
      if (parts[1] === 'student') {
        role = 'student';
        userId = 'student-jordan-uuid-000000000002';
        name = 'Jordan Lee';
      }
    }

    // Try finding profile in database
    const dbUser = await getUserById(userId).catch(() => null);
    if (dbUser) {
      req.user = {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        name: dbUser.full_name,
      };
    } else {
      req.user = {
        id: userId,
        email: `${userId}@school.edu`,
        role,
        name,
      };
    }
    return next();
  }

  return res.status(401).json({ error: 'Invalid or expired session token' });
}
