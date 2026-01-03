import bcrypt from 'bcryptjs';
import {
  findUserByEmail,
  findUserForAuth,
  insertUser,
  isEmailTaken,
  isUsernameTaken,
  updateUserStatus,
  markUserCompromised,
} from '../models/userModel.js';
import { normalizeUsername, isValidUsername } from '../utils/validation.js';
import { ServiceError } from '../utils/errors.js';

export const registerUser = async ({
  username,
  email,
  password,
}: {
  username: string;
  email: string;
  password: string;
}) => {
  if (!username || !email || !password) {
    throw new ServiceError(400, 'AUTH_MISSING_FIELDS', 'Missing fields');
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (password.length < 8 || !hasUpper || !hasLower || !hasNumber) {
    throw new ServiceError(
      400,
      'AUTH_PASSWORD_WEAK',
      'Password must be at least 8 characters and include uppercase, lowercase, and a number.'
    );
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    throw new ServiceError(
      400,
      'AUTH_USERNAME_INVALID',
      'Username must be 3-30 characters, one word (letters, numbers, . or _).'
    );
  }

  const emailTaken = await isEmailTaken(email.toLowerCase());
  if (emailTaken) {
    throw new ServiceError(409, 'AUTH_EMAIL_TAKEN', 'Email already registered');
  }

  const usernameTaken = await isUsernameTaken(normalizedUsername);
  if (usernameTaken) {
    throw new ServiceError(409, 'AUTH_USERNAME_TAKEN', 'Username already taken');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userRow = await insertUser({
    username: normalizedUsername,
    email: email.toLowerCase(),
    passwordHash,
  });
  return userRow;
};

const DUMMY_PASSWORD_HASH =
  '$2a$12$yqbqChwXp7YbWk5mV0MZVOW/6cZc0cx0yGRvFSXWm7KJcS4H0fN7S';

export const loginUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  if (!email || !password) {
    throw new ServiceError(400, 'AUTH_MISSING_FIELDS', 'Missing fields');
  }

  const userRow = await findUserByEmail(email.toLowerCase());
  const passwordHash = userRow?.password_hash || DUMMY_PASSWORD_HASH;
  const match = await bcrypt.compare(password, passwordHash);
  if (!match || !userRow) {
    throw new ServiceError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials');
  }
  return userRow;
};

export const logoutUser = async (userId: string) => {
  await updateUserStatus(userId, 'offline');
};

export const markAccountCompromised = async (userId: string) => {
  await markUserCompromised(userId);
};

export const getCurrentUser = async (userId: string) => {
  const userRow = await findUserForAuth(userId);
  if (!userRow) {
    throw new ServiceError(404, 'AUTH_USER_NOT_FOUND', 'User not found');
  }
  return userRow;
};
