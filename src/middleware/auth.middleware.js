import jwt from 'jsonwebtoken';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';

dotenv.config();

// In-memory cache for authenticated user context (TTL: 5 minutes)
export const authCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'default_credence_secret_key';
    const decoded = jwt.verify(token, jwtSecret);

    const userId = decoded.id;
    const { role, loginAccess } = decoded;

    if (role !== 'superAdmin' && loginAccess === false) {
      return res.status(401).json({
        message: 'Your login access is denied',
      });
    }

    // ✅ CHECK CACHE FIRST
    const cachedUser = authCache.get(userId);

    if (cachedUser) {
      req.user = cachedUser;
      return next();
    }

    const userContext = {
      id: decoded.id,
      username: decoded.username || null,
      role: decoded.role,
      schoolId: decoded.schoolId || null,
      branchId: decoded.branchId || null,
      AssignedBranch: decoded.AssignedBranch || null,
      loginAccess: decoded.loginAccess,
    };

    // ✅ SAVE TO CACHE
    authCache.set(userId, userContext);

    req.user = userContext;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export default authenticateUser;
