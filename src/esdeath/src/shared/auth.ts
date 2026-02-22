import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export function verifyInternalToken(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' });
      return;
    }

    const token = header.slice(7);
    try {
      jwt.verify(token, secret);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

export function generateInternalToken(secret: string): string {
  return jwt.sign({ iss: 'esdeath-gateway', iat: Math.floor(Date.now() / 1000) }, secret, {
    expiresIn: '24h',
  });
}
