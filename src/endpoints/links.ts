import type { Request, Response } from 'express';
import type { Router } from 'express';
import type { SessionData } from 'express-session';
import express from 'express';
import path from 'path';
import fs from 'fs';
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

// GET Links Page
router.get('/links', isAuthenticated, (req: Request, res: Response) => {
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    let linksData: any[] = [];
    let errorMsg: string | null = null;

    try {
        const linksPath = path.resolve(__dirname, '../../config/links.json');
        if (fs.existsSync(linksPath)) {
            const rawLinks = fs.readFileSync(linksPath, 'utf-8');
            const parsedData = JSON.parse(rawLinks);
            if (Array.isArray(parsedData?.links)) {
                linksData = parsedData.links;
            } else {
                console.warn("links.json format is incorrect. Expected an object with a 'links' array.");
                errorMsg = "Links configuration file is improperly formatted.";
            }
        } else {
            console.warn("links.json not found in config folder.");
            errorMsg = "Links configuration file not found.";
        }
    } catch (error: any) {
        console.error("Error reading or parsing links.json:", error.message);
        errorMsg = "Failed to load links configuration.";
    }

    res.render('links', {
        title: appName,
        links: linksData,
        error: errorMsg,
        user: (req.session as AuthenticatedSessionData).user ?? null
    });
});

export default router;
