import type { Request, Response, NextFunction } from 'express';
import type { Router } from 'express';
import express from 'express';
import bcrypt from 'bcryptjs';
import { isAuthenticated } from '../middleware/auth';
import db from '../db';
import { findUserByEmail, updateUser, listUserServers, deleteUser } from '../pterodactyl';

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

router.get('/settings', isAuthenticated, (req: Request, res: Response) => {
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }
    res.render('settings', {
        title: appName,
        user: req.session.user,
        success: req.query.success,
        error: req.query.error
    });
});

router.post('/settings/profile', isAuthenticated, async (req: Request, res: Response) => {
    const { username, email, lastName } = req.body;
    const userId = req.session.user?.id;
    const currentEmail = req.session.user?.email;

    if (!userId || !currentEmail) {
        return res.redirect('/login');
    }

    if (!username || !email || !lastName) {
        return res.redirect('/settings?error=Username,+email,+and+last+name+are+required.');
    }

    try {
        const pteroUser = await findUserByEmail(currentEmail);
        if (!pteroUser) {
            console.error(`Pterodactyl user not found for email ${currentEmail} during profile update.`);
            return res.redirect('/settings?error=Could+not+find+corresponding+panel+user.');
        }

        await updateUser(pteroUser.id, {
            username: username,
            email: email,
            firstName: username,
            lastName: lastName
        });
        console.log(`Pterodactyl user ${pteroUser.id} updated.`);

        const sql = `UPDATE users SET username = ?, email = ? WHERE id = ?`;
        await new Promise<void>((resolve, reject) => {
            db.run(sql, [username, email, userId], function(err: Error | null) {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log(`Local user ${userId} updated.`);

        if (req.session.user) {
            req.session.user.username = username;
            req.session.user.email = email;
        }
        req.session.save((saveErr) => {
            if (saveErr) {
                console.error("Session save error after profile update:", saveErr);
            }
            res.redirect('/settings?success=Profile+updated+successfully.');
        });

    } catch (error: any) {
        console.error("Profile update failed:", error.message);
        res.redirect(`/settings?error=${encodeURIComponent(error.message || 'Failed to update profile.')}`);
    }
});

router.post('/settings/password', isAuthenticated, async (req: Request, res: Response) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.session.user?.id;
    const currentEmail = req.session.user?.email;

    if (!userId || !currentEmail) {
        return res.redirect('/login');
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.redirect('/settings?error=All+password+fields+are+required.');
    }
    if (newPassword !== confirmNewPassword) {
        return res.redirect('/settings?error=New+passwords+do+not+match.');
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
        return res.redirect(`/settings?error=${encodeURIComponent(passwordValidation.error || '')}`);
    }

    try {
        const sqlGet = `SELECT password FROM users WHERE id = ?`;
        const user = await new Promise<{ password: string } | undefined>((resolve, reject) => {
            db.get(sqlGet, [userId], (err: Error | null, row: { password: string } | undefined) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            console.error(`User ${userId} not found for password change.`);
            req.session.destroy(() => {});
            return res.redirect('/login');
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.redirect('/settings?error=Incorrect+current+password.');
        }

        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        const sqlUpdate = `UPDATE users SET password = ? WHERE id = ?`;
        await new Promise<void>((resolve, reject) => {
            db.run(sqlUpdate, [hashedNewPassword, userId], function(err: Error | null) {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            const pteroUser = await findUserByEmail(currentEmail);
            if (pteroUser) {
                await updateUser(pteroUser.id, { password: newPassword });
                console.log(`Pterodactyl password potentially updated for user ${userId}.`);
            } else {
                console.warn(`Could not find Pterodactyl user ${currentEmail} to update password.`);
            }
        } catch (pteroErr: any) {
            console.warn(`Failed to update Pterodactyl password for user ${userId}: ${pteroErr.message}`);
        }

        res.redirect('/settings?success=Password+updated+successfully.');

    } catch (error: any) {
        console.error("Password change failed:", error.message);
        res.redirect(`/settings?error=${encodeURIComponent(error.message || 'Failed to change password.')}`);
    }
});

router.post('/settings/delete', isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.user?.id;
    const userEmail = req.session.user?.email;

    if (!userId || !userEmail) {
        return res.redirect('/login');
    }

    try {
        const pteroUser = await findUserByEmail(userEmail);
        if (!pteroUser) {
            console.warn(`Pterodactyl user ${userEmail} not found during deletion attempt. Proceeding with local deletion.`);
        } else {
            const servers = await listUserServers(pteroUser.id);
            if (servers.length > 0) {
                return res.redirect('/settings?error=Cannot+delete+account+while+owning+servers.');
            }
            await deleteUser(pteroUser.id);
            console.log(`Pterodactyl user ${pteroUser.id} deleted.`);
        }

        const sql = `DELETE FROM users WHERE id = ?`;
        await new Promise<void>((resolve, reject) => {
            db.run(sql, [userId], function(err: Error | null) {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log(`Local user ${userId} deleted.`);

        req.session.destroy((destroyErr) => {
            if (destroyErr) {
                console.error("Error destroying session after account deletion:", destroyErr);
            }
            res.redirect('/login?message=Account+deleted+successfully.');
        });

    } catch (error: any) {
        console.error(`Account deletion failed for user ${userId}:`, error.message);
        res.redirect(`/settings?error=${encodeURIComponent(error.message || 'Failed to delete account.')}`);
    }
});

export default router;
