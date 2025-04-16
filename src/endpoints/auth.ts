import type { Request, Response, NextFunction } from 'express';
import type { Router } from 'express';
import type { SessionData } from 'express-session';
import express from 'express';
import bcrypt from 'bcryptjs';
import { createUser as createPterodactylUser } from '../pterodactyl';
import db from '../db';
import { isAuthenticated } from '../middleware/auth';

interface AuthenticatedSessionData extends SessionData {
    user?: {
        id: number;
        username: string;
        email: string;
        password?: string;
        isAdmin: boolean;
    };
}

const router: Router = express.Router();

function validatePassword(password: string): { isValid: boolean; error?: string } {
    if (password.length < 8) {
        return { isValid: false, error: 'Password must be at least 8 characters long.' };
    }
    if (!/[a-z]/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one lowercase letter.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one uppercase letter.' };
    }
    if (!/\d/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one number.' };
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one special character.' };
    }
    return { isValid: true };
}

router.get('/login', (req: Request, res: Response) => {
    if ((req.session as AuthenticatedSessionData).user) { 
        return res.redirect('/dashboard');
    }
    res.render('login', { title: process.env.APP_NAME || 'AzrovaDash', error: null });
});

router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    const appName = process.env.APP_NAME || 'AzrovaDash';

    if (!username || !password) {
        return res.status(400).render('login', { title: appName, error: 'Username/Email and password are required.' });
    }

    const sql = `SELECT * FROM users WHERE username = ? OR email = ?`;
    db.get(sql, [username, username], async (err, user: any) => {
        if (err) {
            console.error("Database error during login:", err.message);
            return res.status(500).render('login', { title: appName, error: 'Database error during login.' });
        }
        if (!user) {
            return res.status(401).render('login', { title: appName, error: 'Invalid credentials.' });
        }

        try {
            if (password === user.password) {
                req.session.regenerate((regenErr) => {
                    if (regenErr) {
                        console.error("Session regeneration error:", regenErr);
                        return res.status(500).render('login', { title: appName, error: 'Session error during login.' });
                    }
                    (req.session as AuthenticatedSessionData).user = { 
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        password: password, 
                        isAdmin: !!user.isAdmin
                    };
                    req.session.save((saveErr) => {
                        if (saveErr) {
                            console.error("Session save error:", saveErr);
                            return res.status(500).render('login', { title: appName, error: 'Session error during login.' });
                        }
                        res.redirect('/dashboard');
                    });
                });
            } else {
                return res.status(401).render('login', { title: appName, error: 'Invalid credentials.' });
            }
        } catch (compareError) {
            console.error("Error comparing password:", compareError);
            return res.status(500).render('login', { title: appName, error: 'Error during authentication.' });
        }
    });
});

router.get('/register', (req: Request, res: Response) => {
    if ((req.session as AuthenticatedSessionData).user) { 
        return res.redirect('/dashboard');
    }
    res.render('register', { title: process.env.APP_NAME || 'AzrovaDash', error: null });
});

router.post('/register', async (req: Request, res: Response) => {
    const { username, lastName, email, password, confirmPassword } = req.body;
    const appName = process.env.APP_NAME || 'AzrovaDash';

    if (!username || !lastName || !email || !password || !confirmPassword) {
        return res.status(400).render('register', { title: appName, error: 'All fields are required.' });
    }
    if (password !== confirmPassword) {
        return res.status(400).render('register', { title: appName, error: 'Passwords do not match.' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
        return res.status(400).render('register', { title: appName, error: passwordValidation.error });
    }

    try {
        const pteroUser = await createPterodactylUser({
            username: username,
            email: email,
            firstName: username,
            lastName: lastName,
            password: password,
        });
        console.log(`Pterodactyl user created successfully (ID: ${pteroUser.id})`);

        const sql = `INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, ?)`;
        db.run(sql, [username, email, password, 0], function(err) {
            if (err) {
                console.error("Error inserting user into local database:", err.message);
                return res.status(500).render('register', { title: appName, error: 'Failed to save user locally after panel creation.' });
            }
            console.log(`User ${username} added to local database with ID: ${this.lastID}`);
            res.redirect('/login');
        });
    } catch (error: any) {
        console.error("Registration failed:", error.message);
        const errorMessage = error?.message || 'An unexpected error occurred during registration.';
        res.status(500).render('register', { title: appName, error: errorMessage });
    }
});

router.get('/credentials', isAuthenticated, (req: Request, res: Response) => {
    const userEmail = (req.session as AuthenticatedSessionData).user?.email; 
    const appName = process.env.APP_NAME || 'AzrovaDash';

    if (!userEmail) {
        return res.redirect('/login');
    }

    res.render('credentials', {
        title: appName,
        user: (req.session as AuthenticatedSessionData).user, 
        panelUrl: process.env.PANEL_URL
    });
});

router.get('/logout', (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return next(err);
        }
        res.redirect('/login');
    });
});

export default router;
