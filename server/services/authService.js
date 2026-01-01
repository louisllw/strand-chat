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

export const registerUser = async ({ username, email, password }) => {
  if (!username || !email || !password) {
    throw new ServiceError(400, 'Missing fields');
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    throw new ServiceError(400, 'Username must be 3-30 characters, one word (letters, numbers, . or _).');
  }

  const emailTaken = await isEmailTaken(email.toLowerCase());
  if (emailTaken) {
    throw new ServiceError(409, 'Email already registered');
  }

  const usernameTaken = await isUsernameTaken(normalizedUsername);
  if (usernameTaken) {
    throw new ServiceError(409, 'Username already taken');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userRow = await insertUser({
    username: normalizedUsername,
    email: email.toLowerCase(),
    passwordHash,
  });
  return userRow;
};

export const loginUser = async ({ email, password }) => {
  if (!email || !password) {
    throw new ServiceError(400, 'Missing fields');
  }

  const userRow = await findUserByEmail(email.toLowerCase());
  if (!userRow) {
    throw new ServiceError(401, 'Invalid credentials');
  }

  const match = await bcrypt.compare(password, userRow.password_hash);
  if (!match) {
    throw new ServiceError(401, 'Invalid credentials');
  }

  await updateUserStatus(userRow.id, 'offline');
  return userRow;
};

export const logoutUser = async (userId) => {
  await updateUserStatus(userId, 'offline');
};

export const getCurrentUser = async (userId) => {
  const userRow = await findUserForAuth(userId);
  if (!userRow) {
    throw new ServiceError(404, 'User not found');
  }
  return userRow;
};
