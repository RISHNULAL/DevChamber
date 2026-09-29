import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { User, Profile } from '../models/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'devchamber-jwt-local-secret-key-2026';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

export interface UserPayload {
  id: string;
  email: string;
  role: 'teacher' | 'student' | 'admin';
  name: string;
}

export interface SafeUser {
  id: string;
  email: string;
  full_name: string;
  role: 'teacher' | 'student' | 'admin';
  created_at?: string;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || 'devchamber-jwt-local-secret-key-2026';
  if (!secret || secret.trim().length === 0) {
    const err: any = new Error('Server configuration error: JWT_SECRET is missing.');
    err.statusCode = 500;
    throw err;
  }
  return secret;
}

export function generateToken(payload: UserPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as UserPayload;
    if (decoded && decoded.id && decoded.role) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

export async function signupUser(input: {
  email: string;
  password: string;
  fullName: string;
  role?: 'student' | 'teacher' | 'admin';
}): Promise<{ user: SafeUser; token: string }> {
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const cleanName = (input.fullName || '').trim();
  const role = input.role === 'teacher' ? 'teacher' : 'student';

  if (!cleanEmail || !cleanEmail.includes('@')) {
    const err: any = new Error('Please enter a valid email address.');
    err.statusCode = 400;
    throw err;
  }
  if (!input.password || input.password.length < 6) {
    const err: any = new Error('Password must be at least 6 characters.');
    err.statusCode = 400;
    throw err;
  }
  if (!cleanName) {
    const err: any = new Error('Full name is required.');
    err.statusCode = 400;
    throw err;
  }

  // Check if email already registered
  const existing = await User.findOne({ email: cleanEmail });
  if (existing) {
    const err: any = new Error('An account with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  const userId = uuidv4();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(input.password, salt);

  // Create User & Profile
  await User.create({
    _id: userId,
    email: cleanEmail,
    passwordHash,
    name: cleanName,
    role,
  });

  await Profile.create({
    _id: userId,
    userId,
    fullName: cleanName,
    role,
    email: cleanEmail,
  });

  // Automatically ensure student's own personal workspace is created
  try {
    const { getOrCreatePersonalWorkspace } = await import('./workspaces.js');
    await getOrCreatePersonalWorkspace(userId, cleanName);
  } catch (err) {
    console.warn('[Workspace Auto-Create Error]:', err);
  }

  const safeUser: SafeUser = {
    id: userId,
    email: cleanEmail,
    full_name: cleanName,
    role,
  };

  const token = generateToken({
    id: userId,
    email: cleanEmail,
    role,
    name: cleanName,
  });

  return { user: safeUser, token };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user: SafeUser; token: string }> {
  const cleanEmail = (input.email || '').trim().toLowerCase();

  if (!cleanEmail || !input.password) {
    const err: any = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const userDoc = await User.findOne({ email: cleanEmail });
  if (!userDoc) {
    const err: any = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  const passwordValid = await bcrypt.compare(input.password, userDoc.passwordHash);
  if (!passwordValid) {
    const err: any = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  const profileDoc = await Profile.findById(userDoc._id);
  const fullName = profileDoc?.fullName || userDoc.name || 'User';
  const role = (profileDoc?.role || userDoc.role || 'student') as 'teacher' | 'student' | 'admin';

  const user: SafeUser = {
    id: userDoc._id,
    email: userDoc.email,
    full_name: fullName,
    role,
    created_at: userDoc.createdAt?.toISOString(),
  };

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.full_name,
  });

  return { user, token };
}

export async function getUserById(userId: string): Promise<SafeUser | null> {
  const userDoc = await User.findById(userId);
  if (!userDoc) {
    return null;
  }

  const profileDoc = await Profile.findById(userId);
  return {
    id: userDoc._id,
    email: userDoc.email,
    full_name: profileDoc?.fullName || userDoc.name || 'User',
    role: (profileDoc?.role || userDoc.role || 'student') as 'teacher' | 'student' | 'admin',
    created_at: userDoc.createdAt?.toISOString(),
  };
}
