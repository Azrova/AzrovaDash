import type { Request, Response, NextFunction } from 'express';
import type { Router } from 'express';
import type { SessionData } from 'express-session';
import express from 'express';
import bcrypt from 'bcrypt';
import { isAuthenticated } from '../middleware/auth';
import { db } from '../db';
import { findUserByEmail, updateUser as updatePteroUser, listUserServers, deleteUser as deletePteroUser } from '../pterodactyl';
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

router.get('/settings', isAuthenticated, (req: Request, res: Response) => {
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }
    res.render('settings', {
        title: appName,
        user: (req.session as AuthenticatedSessionData).user,
        success: req.query.success,
        error: req.query.error
    });
});

router.post('/settings/profile', isAuthenticated, async (req: Request, res: Response) => {
    const { username, email, lastName } = req.body;
    const currentUserSession = (req.session as AuthenticatedSessionData).user;

    if (!currentUserSession || !currentUserSession.id || !currentUserSession.email) {
        return res.redirect('/login');
    }
    const userId = currentUserSession.id; 
    const currentEmail = currentUserSession.email;

    if (!username || !email || !lastName) {
        return res.redirect('/settings?error=Username,+email,+and+last+name+are+required.');
    }

    try {
        const pteroUser = await findUserByEmail(currentEmail);
        if (!pteroUser) {
            console.error(`Pterodactyl user not found for email ${currentEmail} during profile update.`);
            return res.redirect('/settings?error=Could+not+find+corresponding+panel+user.');
        }

        await updatePteroUser(pteroUser.id, {
            username: username,
            email: email,
            firstName: username, 
            lastName: lastName
        });
        console.log(`Pterodactyl user ${pteroUser.id} updated.`);

        const usersCollection = db.collection('users');
        const updateResult = await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $set: { username: username, email: email } }
        );

        if (updateResult.matchedCount === 0) {
             console.error(`Local user ${userId} not found during profile update.`);
             return res.redirect('/settings?error=Local+user+record+not+found.');
        }
        console.log(`Local user ${userId} updated (matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}).`);

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
        console.error("Profile update failed:", error);
        if (error.code === 11000) {
            return res.redirect('/settings?error=Email+or+username+already+in+use.');
        }
        res.redirect(`/settings?error=${encodeURIComponent(error.message || 'Failed to update profile.')}`);
    }
});

router.post('/settings/password', isAuthenticated, async (req: Request, res: Response) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const currentUserSession = (req.session as AuthenticatedSessionData).user;

    if (!currentUserSession || !currentUserSession.id || !currentUserSession.email) {
        return res.redirect('/login');
    }
    const userId = currentUserSession.id;
    const currentEmail = currentUserSession.email; 

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
        const usersCollection = db.collection<UserDocument>('users');
        const user = await usersCollection.findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 1 } }
        );

        if (!user) {
            console.error(`User ${userId} not found for password change.`);
            req.session.destroy(() => {}); 
            return res.redirect('/login?error=User+not+found.');
        }

        const isMatch = currentPassword === user.password;

        if (!isMatch) {
            return res.redirect('/settings?error=Incorrect+current+password.');
        }

        const passwordToStore = newPassword;

        const updateResult = await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $set: { password: passwordToStore } }
        );

        if (updateResult.matchedCount === 0) {
             console.error(`User ${userId} not found during password update attempt.`);
             return res.redirect('/settings?error=Failed+to+update+password,+user+not+found.');
        }
        console.log(`Local password updated for user ${userId}.`);

        try {
            const pteroUser = await findUserByEmail(currentEmail);
            if (pteroUser) {
                await updatePteroUser(pteroUser.id, { password: newPassword });
                console.log(`Pterodactyl password potentially updated for user ${userId}.`);
            } else {
                console.warn(`Could not find Pterodactyl user ${currentEmail} to update password.`);
            }
        } catch (pteroErr: any) {
            console.warn(`Failed to update Pterodactyl password for user ${userId}: ${pteroErr.message}`);
        }

        res.redirect('/settings?success=Password+updated+successfully.');

    } catch (error: any) {
        console.error("Password change failed:", error);
        res.redirect(`/settings?error=${encodeURIComponent(error.message || 'Failed to change password.')}`);
    }
});

router.post('/settings/delete', isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    const currentUserSession = (req.session as AuthenticatedSessionData).user;

    if (!currentUserSession || !currentUserSession.id || !currentUserSession.email) {
        return res.redirect('/login');
    }
    const userId = currentUserSession.id;
    const userEmail = currentUserSession.email;

    try {
        const pteroUser = await findUserByEmail(userEmail);
        if (pteroUser) {
             const servers = await listUserServers(pteroUser.id);
             if (servers.length > 0) {
                 return res.redirect('/settings?error=Cannot+delete+account+while+owning+servers.');
             }
             await deletePteroUser(pteroUser.id);
             console.log(`Pterodactyl user ${pteroUser.id} deleted.`);
        } else {
             console.warn(`Pterodactyl user ${userEmail} not found during deletion attempt. Proceeding with local deletion.`);
        }

        const usersCollection = db.collection('users');
        const deleteResult = await usersCollection.deleteOne({ _id: new ObjectId(userId) });

        if (deleteResult.deletedCount === 0) {
            console.warn(`Local user ${userId} not found during deletion, possibly already deleted.`);
        } else {
            console.log(`Local user ${userId} deleted.`);
        }

        req.session.destroy((destroyErr) => {
            if (destroyErr) {
                console.error("Error destroying session after account deletion:", destroyErr);
            }
            res.redirect('/login?message=Account+deleted+successfully.');
        });

    } catch (error: any) {
        console.error(`Account deletion failed for user ${userId}:`, error);
        res.redirect(`/settings?error=${encodeURIComponent(error.message || 'Failed to delete account.')}`);
    }
});

export default router;
