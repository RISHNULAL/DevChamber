import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { store } from '../services/store.js';

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

  // 1. Handle Local Demo Token: demo:<userId>:<role>:<name> or demo-<userId>
  if (token.startsWith('demo-') || token.startsWith('demo:') || token === 'demo') {
    let userId = 'teacher-alex';
    let role: 'teacher' | 'student' | 'admin' = 'teacher';
    let name = 'Alex Morgan';

    if (token.includes(':')) {
      const parts = token.split(':');
      userId = parts[1] || userId;
      role = (parts[2] as 'teacher' | 'student') || role;
      name = parts[3] ? decodeURIComponent(parts[3]) : name;
    } else if (token.startsWith('demo-')) {
      const parts = token.split('-');
      if (parts[1] === 'student' || parts[1] === 'teacher') {
        role = parts[1];
        userId = `${parts[1]}-${parts[2] || 'user'}`;
        name = parts[2] ? parts[2].charAt(0).toUpperCase() + parts[2].slice(1) : (role === 'teacher' ? 'Alex Morgan' : 'Jordan Lee');
      }
    }

    // Ensure user exists in memory store
    if (!store.profiles.has(userId)) {
      store.profiles.set(userId, {
        id: userId,
        full_name: name,
        role,
        email: `${userId}@school.edu`,
      });
    }

    const profile = store.profiles.get(userId)!;
    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      name: profile.full_name || name,
    };
    return next();
  }

  // 2. Handle Real Supabase Token
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (url && key && token) {
    try {
      const client = createClient(url, key);
      const { data, error } = await client.auth.getUser(token);
      if (!error && data.user) {
        const metadata = data.user.user_metadata || {};
        const role = (metadata.role as 'teacher' | 'student') || 'student';
        const name = (metadata.full_name as string) || (data.user.email?.split('@')[0] ?? 'User');

        req.user = {
          id: data.user.id,
          email: data.user.email,
          role,
          name,
        };
        return next();
      }
    } catch {
      // Fall through to error
    }
  }

  // If Supabase is not configured and no token was sent, allow demo fallback for development convenience
  if (!url || !key) {
    // Default to student or teacher based on query or header
    const defaultRole = (req.header('x-demo-role') as 'teacher' | 'student') || 'teacher';
    const defaultId = defaultRole === 'teacher' ? 'teacher-alex' : 'student-jordan';
    const profile = store.profiles.get(defaultId) || {
      id: defaultId,
      full_name: defaultRole === 'teacher' ? 'Alex Morgan' : 'Jordan Lee',
      role: defaultRole,
      email: `${defaultId}@school.edu`,
    };

    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      name: profile.full_name,
    };
    return next();
  }

  return res.status(401).json({ error: 'Authentication required' });
}
