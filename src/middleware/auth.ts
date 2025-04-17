import type { Request, Response, NextFunction } from 'express';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    // Check if user data exists in the session
    if (req.session.user) {
        // User is authenticated, proceed to the next middleware or route handler
        next();
    } else {
        // User is not authenticated, redirect to the login page
        res.redirect('/login');
    }
};
