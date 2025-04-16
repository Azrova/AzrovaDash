import type { Request, Response } from 'express';
import type { Router } from 'express';
import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import db from '../db';
import { findUserByEmail, updateUser, deleteUser } from '../pterodactyl';

const router: Router = express.Router();

type DbGetCallback<T> = (err: Error | null, row: T | undefined) => void;

router.get('/profile', isAuthenticated, (req: Request, res: Response) => {
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }
    res.render('profile', {
        title: appName,
        user: req.session.user
    });
});

router.get('/users', isAuthenticated, (req: Request, res: Response) => {
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }

    const sql = `SELECT id, username, email, isAdmin, createdAt FROM users ORDER BY createdAt DESC`;
    db.all(sql, [], (err, rows: any[]) => {
        if (err) {
            console.error("Database error fetching users:", err.message);
            res.status(500).render('500', {
                title: appName,
                error: 'Failed to retrieve user list.'
            });
            return;
        }
        
        const users = rows.map(row => ({
            id: row.id,
            username: row.username,
            email: row.email,
            isAdmin: !!row.isAdmin,
            createdAt: row.createdAt
        }));
        
        res.render('users', {
            title: appName,
            users,
            user: req.session.user
        });
    });
});

router.post('/users/:id/toggle-role', isAuthenticated, async (req: Request, res: Response) => {
    if (!req.session.user?.isAdmin) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
    }

    const userIdParam = req.params.id;
    if (!userIdParam) {
        res.status(400).json({ error: 'User ID parameter is missing.' });
        return;
    }
    const userId = parseInt(userIdParam, 10);
    if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid User ID format.' });
        return;
    }
    
    const currentUser = req.session.user;

    if (!currentUser || typeof currentUser.id === 'undefined') {
        res.status(401).json({ error: 'User session not found or invalid.' });
        return;
    }

    if (userId === currentUser.id) {
        res.status(400).json({ error: 'Cannot modify your own admin status' });
        return;
    }

    try {
        const getUserSql = `SELECT isAdmin FROM users WHERE id = ?`;
        const user = await new Promise<{ isAdmin: number } | undefined>((resolve, reject) => {
            db.get(getUserSql, [userId], (err: Error | null, row: { isAdmin: number } | undefined) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const newRole = user.isAdmin ? 0 : 1;
        const updateSql = `UPDATE users SET isAdmin = ? WHERE id = ?`;
        await new Promise<void>((resolve, reject) => {
            db.run(updateSql, [newRole, userId], function(err: Error | null) {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({ error: 'Database error' });
    }
});

router.delete('/users/:id', isAuthenticated, async (req: Request, res: Response) => {
    if (!req.session.user?.isAdmin) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
    }

    const userIdParam = req.params.id;
    if (!userIdParam) {
        res.status(400).json({ error: 'User ID parameter is missing.' });
        return;
    }
    const userId = parseInt(userIdParam, 10);
     if (isNaN(userId)) {
        res.status(400).json({ error: 'Invalid User ID format.' });
        return;
    }

    const currentUser = req.session.user;

    if (!currentUser || typeof currentUser.id === 'undefined') {
        res.status(401).json({ error: 'User session not found or invalid.' });
        return;
    }

    if (userId === currentUser.id) {
        res.status(400).json({ error: 'Cannot delete your own account through this route' });
        return;
    }

    try {
        const getUserSql = `SELECT email FROM users WHERE id = ?`;
        const user = await new Promise<{ email: string } | undefined>((resolve, reject) => {
             db.get(getUserSql, [userId], (err: Error | null, row: { email: string } | undefined) => {
                 if (err) {
                     reject(err);
                 } else {
                     resolve(row);
                 }
             });
        });

        if (!user?.email) {
            res.status(404).json({ error: 'User not found or email not available' });
            return;
        }

        const pteroUser = await findUserByEmail(user.email);
        if (pteroUser) {
            try {
                await deleteUser(pteroUser.id);
            } catch (error) {
                console.warn(`Failed to delete Pterodactyl user: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        const deleteSql = `DELETE FROM users WHERE id = ?`;
        await new Promise<void>((resolve, reject) => {
            db.run(deleteSql, [userId], function(err: Error | null) {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
