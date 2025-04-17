import type { Request, Response, NextFunction } from 'express';
import type { Router } from 'express';
import type { SessionData } from 'express-session';
import type { InsertOneResult } from 'mongodb';
import express from 'express';
import bcrypt from 'bcrypt';
import { createUser as createPterodactylUser } from '../pterodactyl';
import { db } from '../db';
import { isAuthenticated } from '../middleware/auth';
import { ObjectId } from 'mongodb';

interface UserDocument { 
    _id: ObjectId;
    username: string;
    email: string;
    password?: string;
    isAdmin: boolean;
    createdAt: Date;
}

interface AuthenticatedSessionData extends SessionData {
    user?: {
        id: string;
        username: string;
        email: string;
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

router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const appName = process.env.APP_NAME || 'AzrovaDash';

    if (!username || !password) {
        return res.status(400).render('login', { title: appName, error: 'Username/Email and password are required.' });
    }

    try {
        const usersCollection = db.collection<UserDocument>('users');
        const user = await usersCollection.findOne({
             $or: [{ username: username }, { email: username }] 
        });

        if (!user) {
            return res.status(401).render('login', { title: appName, error: 'Invalid credentials.' });
        }
        
        if (password === user.password) {
            req.session.regenerate((regenErr) => {
                if (regenErr) {
                    console.error("Session regeneration error:", regenErr);
                    return res.status(500).render('login', { title: appName, error: 'Session error during login.' });
                }
                
                (req.session as AuthenticatedSessionData).user = {
                    id: user._id.toHexString(),
                    username: user.username,
                    email: user.email,
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
    } catch (err) {
        console.error("Database error during login:", err);
        return res.status(500).render('login', { title: appName, error: 'Database error during login.' });
    }
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
        const usersCollection = db.collection<UserDocument>('users');
        const existingUser = await usersCollection.findOne({ $or: [{ username: username }, { email: email }] });
        if (existingUser) {
            return res.status(400).render('register', { title: appName, error: 'Username or email already exists.' });
        }

        const pteroUser = await createPterodactylUser({
            username: username,
            email: email,
            firstName: username,
            lastName: lastName,
            password: password,
        });
        console.log(`Pterodactyl user created successfully (ID: ${pteroUser.id})`);

        const newUser = {
            username: username,
            email: email,
            password: password, 
            isAdmin: false, 
            createdAt: new Date()
        };

        const result = await usersCollection.insertOne(newUser as UserDocument);

        console.log(`User ${username} added to local database with ID: ${result.insertedId}`);
        res.redirect('/login');

    } catch (error: any) {
        console.error("Registration failed:", error);
        const errorMessage = error?.response?.data?.errors?.[0]?.detail || error?.message || 'An unexpected error occurred during registration.';
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
