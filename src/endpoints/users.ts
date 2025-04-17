import type { Request, Response } from 'express';
import type { Router } from 'express';
import type { SessionData } from 'express-session';
import express from 'express';
import { db } from '../db';
import { isAuthenticated } from '../middleware/auth';
import { findUserByEmail, updateUser as updatePteroUser, deleteUser as deletePteroUser } from '../pterodactyl';
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

router.get('/profile', isAuthenticated, (req: Request, res: Response) => {
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }
    res.render('profile', {
        title: appName,
        user: (req.session as AuthenticatedSessionData).user
    });
});

router.get('/users', isAuthenticated, async (req: Request, res: Response) => {
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }

    try {
        const usersCollection = db.collection<UserDocument>('users');
        const usersCursor = usersCollection.find(
            {},
            {
                projection: { _id: 1, username: 1, email: 1, isAdmin: 1, createdAt: 1 },
                sort: { createdAt: -1 } 
            }
        );
        const usersArray = await usersCursor.toArray();

        const users = usersArray.map(userDoc => ({
            id: userDoc._id.toHexString(),
            username: userDoc.username,
            email: userDoc.email,
            isAdmin: !!userDoc.isAdmin,
            createdAt: userDoc.createdAt
        }));
        
        res.render('users', {
            title: appName,
            users,
            user: (req.session as AuthenticatedSessionData).user
        });
    } catch (err) {
        console.error("Database error fetching users:", err);
        res.status(500).render('500', {
            title: appName,
            error: 'Failed to retrieve user list.'
        });
    }
});

router.post('/users/:id/toggle-role', isAuthenticated, async (req: Request, res: Response) => {
    const currentUserSession = (req.session as AuthenticatedSessionData).user;
    const userIdParam = req.params.id;

    if (!currentUserSession) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    
    let userId;
    try {
        userId = new ObjectId(userIdParam);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid User ID format.' });
    }
    
    if (userId.toHexString() === currentUserSession.id) {
        return res.status(400).json({ error: 'Cannot modify your own admin status' });
    }

    try {
        const usersCollection = db.collection<UserDocument>('users');
        const userToModify = await usersCollection.findOne({ _id: userId }, { projection: { isAdmin: 1 } });

        if (!userToModify) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newIsAdmin = !userToModify.isAdmin;
        const updateResult = await usersCollection.updateOne(
            { _id: userId },
            { $set: { isAdmin: newIsAdmin } }
        );

        if (updateResult.modifiedCount === 0) {
            console.warn(`Toggle role for user ${userIdParam}: No documents modified.`);
            const checkUser = await usersCollection.findOne({ _id: userId }, { projection: { isAdmin: 1 } });
            if (checkUser?.isAdmin === newIsAdmin) {
                 return res.json({ success: true, message: 'Role was already set or updated concurrently.' });
            }
            return res.status(500).json({ error: 'Failed to update user role state.'});
        }
        
        res.json({ success: true });

    } catch (error) {
        console.error(`Error updating user role for ${userIdParam}:`, error);
        res.status(500).json({ error: 'Database error' });
    }
});

router.delete('/users/:id', isAuthenticated, async (req: Request, res: Response) => {
    const currentUserSession = (req.session as AuthenticatedSessionData).user;
    const userIdParam = req.params.id;

    if (!currentUserSession) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    
    let userIdToDelete;
    try {
        userIdToDelete = new ObjectId(userIdParam);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid User ID format.' });
    }

    if (userIdToDelete.toHexString() === currentUserSession.id) {
        return res.status(400).json({ error: 'Cannot delete your own account through this route' });
    }

    try {
        const usersCollection = db.collection<UserDocument>('users');
        const userToDelete = await usersCollection.findOne({ _id: userIdToDelete }, { projection: { email: 1 } });

        if (!userToDelete?.email) {
            console.warn(`Attempted to delete non-existent or email-less user: ${userIdParam}`);
            return res.json({ success: true, message: 'User not found or already deleted.' });
        }

        try {
            const pteroUser = await findUserByEmail(userToDelete.email);
            if (pteroUser) {
                await deletePteroUser(pteroUser.id);
                console.log(`Pterodactyl user ${pteroUser.id} (email: ${userToDelete.email}) deleted.`);
            }
        } catch (pteroError) {
            console.warn(`Failed to delete Pterodactyl user (email: ${userToDelete.email}): ${pteroError instanceof Error ? pteroError.message : 'Unknown error'}`);
        }

        const deleteResult = await usersCollection.deleteOne({ _id: userIdToDelete });

        if (deleteResult.deletedCount === 0) {
            console.warn(`Attempted to delete user ${userIdParam}, but no documents were deleted (potentially already deleted).`);
             return res.json({ success: true, message: 'User already deleted.' });
        }

        console.log(`Local user ${userIdParam} deleted.`);
        res.json({ success: true });

    } catch (error) {
        console.error(`Error deleting user ${userIdParam}:`, error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
