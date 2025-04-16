import type { Request, Response } from 'express';
import type { Router } from 'express';
import type { SessionData } from 'express-session';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { isAuthenticated } from '../middleware/auth';
import { findUserByEmail, listUserServers } from '../pterodactyl'; 

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

router.get('/dashboard', isAuthenticated, async (req: Request, res: Response) => {
    const userEmail = (req.session as AuthenticatedSessionData).user?.email;
    const appName = process.env.APP_NAME ?? 'AzrovaDash';

    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }
    if (!userEmail) {
        return res.redirect('/login');
    }

    let dashboardData = {};
    let totalLimits = { cpu: 0, memory: 0, disk: 0, serverLimit: 0, backups: 0, databases: 0 };
    let currentUsage = { cpu: 0, memory: 0, disk: 0, serverCount: 0, backups: 0, databases: 0 };

    try {
        const configPath = path.resolve(__dirname, '../../config/default_server_resources.json');
        if (!fs.existsSync(configPath)) {
             console.error(`Config file not found at: ${configPath}`);
             throw new Error('Default server resources configuration file not found.');
        }

        const rawConfig = fs.readFileSync(configPath, 'utf-8');
        const configData = JSON.parse(rawConfig);
        totalLimits = {
            cpu: configData.limits?.cpu ?? 0,
            memory: configData.limits?.memory ?? 0,
            disk: configData.limits?.disk ?? 0,
            serverLimit: configData.feature_limits?.server_limit ?? 0,
            backups: configData.feature_limits?.backups ?? 0,
            databases: configData.feature_limits?.databases ?? 0
        };

        const pteroUser = await findUserByEmail(userEmail);
        if (pteroUser) {
            const currentServers = await listUserServers(pteroUser.id);
            currentUsage.serverCount = currentServers.length;
            currentServers.forEach(server => {
                currentUsage.cpu += server.attributes?.limits?.cpu ?? 0;
                currentUsage.memory += server.attributes?.limits?.memory ?? 0;
                currentUsage.disk += server.attributes?.limits?.disk ?? 0;
                currentUsage.backups += server.attributes?.feature_limits?.backups ?? 0;
                currentUsage.databases += server.attributes?.feature_limits?.databases ?? 0;
            });
        } else {
            console.warn(`Could not find Pterodactyl user for ${userEmail} to calculate resource usage.`);
        }

        dashboardData = {
            cpuDisplay: `${currentUsage.cpu}% / ${totalLimits.cpu}%`,
            ramDisplay: `${(currentUsage.memory / 1024).toFixed(1)} GB / ${(totalLimits.memory / 1024).toFixed(1)} GB`,
            diskDisplay: `${(currentUsage.disk / 1024).toFixed(1)} GB / ${(totalLimits.disk / 1024).toFixed(1)} GB`,
            serverLimitDisplay: `${currentUsage.serverCount} / ${totalLimits.serverLimit}`,
            backupsDisplay: `${currentUsage.backups} / ${totalLimits.backups}`,
            databasesDisplay: `${currentUsage.databases} / ${totalLimits.databases}`,
            limits: totalLimits,
            usage: currentUsage
        };

    } catch (error: any) {
        console.error("Error fetching dashboard data:", error.message);
        dashboardData = {
            cpuDisplay: 'N/A / N/A',
            ramDisplay: 'N/A / N/A',
            diskDisplay: 'N/A / N/A',
            serverLimitDisplay: 'N/A / N/A',
            backupsDisplay: 'N/A / N/A',
            databasesDisplay: 'N/A / N/A',
            limits: { cpu: 'N/A', memory: 'N/A', disk: 'N/A', serverLimit: 'N/A', backups: 'N/A', databases: 'N/A' },
            usage: { cpu: 'N/A', memory: 'N/A', disk: 'N/A', serverCount: 'N/A', backups: 'N/A', databases: 'N/A' }
        };
    }

    res.render('dashboard', {
        title: appName,
        stats: dashboardData,
        user: (req.session as AuthenticatedSessionData).user ?? null
    });
});

export default router;
