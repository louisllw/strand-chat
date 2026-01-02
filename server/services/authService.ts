import bcrypt from 'bcryptjs';
import {
  findUserByEmail,
  findUserForAuth,
  insertUser,
  isEmailTaken,
  isUsernameTaken,
  updateUserStatus,
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
  if (!userRow) {
    throw new ServiceError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials');
  }

  const match = await bcrypt.compare(password, userRow.password_hash);
  if (!match) {
    throw new ServiceError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials');
  }
  return userRow;
};

export const logoutUser = async (userId: string) => {
  await updateUserStatus(userId, 'offline');
};

export const getCurrentUser = async (userId: string) => {
  const userRow = await findUserForAuth(userId);
  if (!userRow) {
    throw new ServiceError(404, 'AUTH_USER_NOT_FOUND', 'User not found');
  }
  return userRow;
};
