const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const SALT_ROUNDS = 10;

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters long');
  }
  if (password.length > 72) throw ApiError.badRequest('Password must be at most 72 characters long');
}

const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

async function register({ name, email, password, role = 'staff' }) {
  if (typeof name !== 'string' || !name.trim()) throw ApiError.badRequest('Name is required');
  if (typeof email !== 'string' || !email.trim()) throw ApiError.badRequest('Email is required');
  validatePassword(password);
  const normalized = email.trim().toLowerCase();
  if (await User.exists({ email: normalized })) {
    throw ApiError.conflict('An account with this email already exists');
  }
  const user = await User.create({
    name: name.trim(),
    email: normalized,
    passwordHash: await hashPassword(password),
    role,
  });
  return user;
}

async function login({ email, password }) {
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw ApiError.badRequest('Email and password are required');
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  // Same message for "no such user" and "wrong password" so attackers cannot probe for accounts.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  return user;
}

// Creates the demo admin from ADMIN_EMAIL / ADMIN_PASSWORD if it does not exist yet.
async function ensureAdminUser() {
  const { name, email, password } = env.admin;
  if (!email || !password || password.startsWith('change_me')) {
    return { created: false, reason: 'ADMIN_EMAIL / ADMIN_PASSWORD are not set in backend/.env' };
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return { created: false, reason: 'already exists', email: existing.email };
  validatePassword(password);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    role: 'admin',
  });
  return { created: true, email: user.email };
}

module.exports = { register, login, signToken, ensureAdminUser };
