import type { NextFunction, Request, Response } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.userId === undefined) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}
