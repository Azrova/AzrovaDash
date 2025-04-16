import type { Request, Response } from 'express';
import type { Router } from 'express';
import type { SessionData } from 'express-session';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { isAuthenticated } from '../middleware/auth';
import { findUserByEmail, listUserServers, listAllocations, createPteroServer, getServerStatus } from '../pterodactyl';

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

interface ServerLimits {
    memory: number;
    disk: number;
    io: number;
    cpu: number;
    swap?: number;
}

interface ServerFeatures {
    databases: number;
    allocations: number;
    backups: number;
}

router.get('/servers', isAuthenticated, async (req: Request, res: Response) => {
    const userEmail = (req.session as AuthenticatedSessionData).user?.email;
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    let serverLimit = 0;

    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }
    if (!userEmail) {
        return res.redirect('/login');
    }

    try {
        const pteroUser = await findUserByEmail(userEmail);
        if (!pteroUser) {
            console.error(`Pterodactyl user ${userEmail} not found when trying to list servers.`);
            return res.render('servers', {
                title: appName,
                servers: [],
                serverLimit: 0,
                currentServerCount: 0,
                error: 'Could not find your associated panel account.',
                user: (req.session as AuthenticatedSessionData).user
            });
        }

        try {
            const configPath = path.resolve(__dirname, '../../config/default_server_resources.json');
            if (!fs.existsSync(configPath)) {
                console.error(`Config file not found at: ${configPath}`);
                throw new Error('Default server resources configuration file not found.');
            }
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            const configData = JSON.parse(rawConfig);
            serverLimit = configData.feature_limits?.server_limit ?? 0;
        } catch (configError: any) {
            console.error("Error reading server limit from config:", configError.message);
        }

        const servers = await listUserServers(pteroUser.id);
        const currentServerCount = servers.length;

        res.render('servers', {
            title: appName,
            servers: servers,
            serverLimit: serverLimit,
            currentServerCount: currentServerCount,
            error: null,
            user: (req.session as AuthenticatedSessionData).user,
            panelUrl: process.env.PANEL_URL
        });

    } catch (error: any) {
        console.error(`Failed to list servers for user ${userEmail}:`, error.message);
        res.render('servers', {
            title: appName,
            servers: [],
            serverLimit: serverLimit,
            currentServerCount: 0,
            error: error.message || 'Failed to retrieve server list.',
            user: (req.session as AuthenticatedSessionData).user
        });
    }
});

router.get('/servers/create', isAuthenticated, async (req: Request, res: Response) => {
    const userEmail = (req.session as AuthenticatedSessionData).user?.email;
    const appName = process.env.APP_NAME ?? 'AzrovaDash';
    let serverLimit = 0;
    let currentServerCount = 0;
    let defaultLimits: ServerLimits = { memory: 0, disk: 0, io: 0, cpu: 0 };
    let defaultFeatures: ServerFeatures = { databases: 0, allocations: 1, backups: 0 };
    let nodes: any[] = [];
    let eggs: any[] = [];
    let configErrorMsg: string | null = null;

    if (!appName) {
        console.error("APP_NAME environment variable is not set.");
        res.status(500).send("Application configuration error.");
        return;
    }
    if (!userEmail) {
        return res.redirect('/login');
    }

    try {
        try {
            const resourcesConfigPath = path.resolve(__dirname, '../../config/default_server_resources.json');
            if (!fs.existsSync(resourcesConfigPath)) throw new Error('Default server resources config not found.');
            const rawResourcesConfig = fs.readFileSync(resourcesConfigPath, 'utf-8');
            const resourcesConfigData = JSON.parse(rawResourcesConfig);
            serverLimit = resourcesConfigData.feature_limits?.server_limit ?? 0;
            defaultLimits = {
                memory: resourcesConfigData.limits?.memory ?? 0,
                disk: resourcesConfigData.limits?.disk ?? 0,
                io: resourcesConfigData.limits?.io ?? 0,
                cpu: resourcesConfigData.limits?.cpu ?? 0
            };
            defaultFeatures = {
                databases: resourcesConfigData.feature_limits?.databases ?? 0,
                allocations: resourcesConfigData.feature_limits?.allocations ?? 1,
                backups: resourcesConfigData.feature_limits?.backups ?? 0
            };

            const nodesConfigPath = path.resolve(__dirname, '../../config/nodes.json');
            if (!fs.existsSync(nodesConfigPath)) throw new Error('Nodes config not found.');
            const rawNodesConfig = fs.readFileSync(nodesConfigPath, 'utf-8');
            nodes = JSON.parse(rawNodesConfig);
            if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("Nodes configuration is invalid or empty.");

            const eggsDir = path.resolve(__dirname, '../../config/eggs');
            if (!fs.existsSync(eggsDir)) throw new Error('Eggs directory not found.');
            const eggFiles = fs.readdirSync(eggsDir).filter(file => file.endsWith('.json'));
            if (eggFiles.length === 0) throw new Error("No egg configurations found.");
            eggs = eggFiles.map(file => {
                const rawEggConfig = fs.readFileSync(path.join(eggsDir, file), 'utf-8');
                return JSON.parse(rawEggConfig);
            });

        } catch (configError: any) {
            console.error("Error reading configuration for create page:", configError);
            configErrorMsg = configError.message || 'Could not load server configuration.';
        }

        if (!configErrorMsg) {
            const pteroUser = await findUserByEmail(userEmail);
            if (!pteroUser) {
                return res.redirect('/servers?error=Could+not+find+associated+panel+user.');
            }
            const servers = await listUserServers(pteroUser.id);
            currentServerCount = servers.length;
            if (currentServerCount >= serverLimit) {
                return res.redirect('/servers?error=Server+limit+reached.');
            }
        }

        res.render('servers/create', {
            title: appName,
            defaultLimits: defaultLimits,
            defaultFeatures: defaultFeatures,
            nodes: nodes,
            eggs: eggs,
            error: configErrorMsg || req.query.error || null,
            user: (req.session as AuthenticatedSessionData).user
        });

    } catch (error: any) {
        console.error(`Failed to load create server page for user ${userEmail}:`, error.message);
        res.redirect(`/servers?error=${encodeURIComponent(error.message || 'Failed to load server creation page.')}`);
    }
});

router.post('/servers/create', isAuthenticated, async (req: Request, res: Response) => {
    const { 
        serverName, 
        serverDescription, 
        nodeId, 
        eggId,
        memory,
        disk,
        cpu,
        io,
        backups,
        databases
    } = req.body;
    const userEmail = (req.session as AuthenticatedSessionData).user?.email;
    let serverLimit = 0;
    let defaultLimits: ServerLimits = { memory: 0, disk: 0, io: 0, cpu: 0 };
    let defaultFeatures: ServerFeatures = { databases: 0, allocations: 1, backups: 0 };
    let selectedEgg: any = null;

    if (!userEmail) {
        return res.redirect('/login');
    }
    if (!serverName || !nodeId || !eggId) {
        return res.redirect('/servers/create?error=Server+name,+node,+and+egg+are+required.');
    }

    try {
        const configPath = path.resolve(__dirname, '../../config/default_server_resources.json');
        if (!fs.existsSync(configPath)) throw new Error('Default server resources config not found.');
        const rawConfig = fs.readFileSync(configPath, 'utf-8');
        const configData = JSON.parse(rawConfig);
        serverLimit = configData.feature_limits?.server_limit ?? 0;
        defaultLimits = {
            memory: configData.limits?.memory ?? 0,
            disk: configData.limits?.disk ?? 0,
            io: configData.limits?.io ?? 0,
            cpu: configData.limits?.cpu ?? 0
        };
        defaultFeatures = {
            databases: configData.feature_limits?.databases ?? 0,
            allocations: configData.feature_limits?.allocations ?? 1,
            backups: configData.feature_limits?.backups ?? 0
        };

        const pteroUser = await findUserByEmail(userEmail);
        if (!pteroUser) throw new Error('Could not find associated panel user.');

        const currentServers = await listUserServers(pteroUser.id);
        if (currentServers.length >= serverLimit) {
            return res.redirect('/servers?error=Server+limit+reached.');
        }

        let currentCpuUsage = 0;
        let currentMemoryUsage = 0;
        let currentDiskUsage = 0;

        currentServers.forEach(server => {
            currentCpuUsage += server.attributes?.limits?.cpu ?? 0;
            currentMemoryUsage += server.attributes?.limits?.memory ?? 0;
            currentDiskUsage += server.attributes?.limits?.disk ?? 0;
        });

        const requestedCpu = cpu ? parseInt(cpu) : defaultLimits.cpu;
        const requestedMemory = memory ? parseInt(memory) : defaultLimits.memory;
        const requestedDisk = disk ? parseInt(disk) : defaultLimits.disk;

        if ((currentCpuUsage + requestedCpu) > defaultLimits.cpu) {
            return res.redirect(`/servers/create?error=CPU+limit+exceeded.+Available:+${defaultLimits.cpu - currentCpuUsage}%.+Requested:+${requestedCpu}%.`);
        }
        if ((currentMemoryUsage + requestedMemory) > defaultLimits.memory) {
            return res.redirect(`/servers/create?error=Memory+limit+exceeded.+Available:+${((defaultLimits.memory - currentMemoryUsage)/1024).toFixed(1)}+GB.+Requested:+${(requestedMemory/1024).toFixed(1)}+GB.`);
        }
        if ((currentDiskUsage + requestedDisk) > defaultLimits.disk) {
            return res.redirect(`/servers/create?error=Disk+limit+exceeded.+Available:+${((defaultLimits.disk - currentDiskUsage)/1024).toFixed(1)}+GB.+Requested:+${(requestedDisk/1024).toFixed(1)}+GB.`);
        }

        const eggsDir = path.resolve(__dirname, '../../config/eggs');
        if (!fs.existsSync(eggsDir)) throw new Error('Eggs directory not found.');
        const eggFiles = fs.readdirSync(eggsDir).filter(file => file.endsWith('.json'));
        for (const file of eggFiles) {
            const rawEggConfig = fs.readFileSync(path.join(eggsDir, file), 'utf-8');
            const eggConfig = JSON.parse(rawEggConfig);
            if (eggConfig.egg_id == eggId) {
                selectedEgg = eggConfig;
                break;
            }
        }
        if (!selectedEgg) throw new Error(`Selected egg configuration (ID: ${eggId}) not found.`);

        const allocations = await listAllocations(parseInt(nodeId, 10));
        const availableAllocation = allocations.find(alloc => !alloc.attributes.assigned);
        if (!availableAllocation) throw new Error(`No available allocations found on node ID: ${nodeId}.`);
        const allocationId = availableAllocation.attributes.id;

        const serverOptions = {
            name: serverName,
            description: serverDescription || null,
            ownerId: pteroUser.id,
            eggId: parseInt(eggId, 10),
            dockerImage: selectedEgg.docker_image,
            startupCommand: selectedEgg.startup_command,
            limits: {
                memory: requestedMemory,
                swap: 0,
                disk: requestedDisk,
                io: io ? parseInt(io) : defaultLimits.io,
                cpu: requestedCpu
            },
            featureLimits: {
                databases: databases ? parseInt(databases) : defaultFeatures.databases,
                allocations: defaultFeatures.allocations,
                backups: backups ? parseInt(backups) : defaultFeatures.backups
            },
            allocationId: allocationId,
            environment: selectedEgg.environment || {}
        };

        await createPteroServer(serverOptions);

        res.redirect('/servers?success=Server+created+successfully!');

    } catch (error: any) {
        console.error(`Server creation failed for user ${userEmail}:`, error.message);
        res.redirect(`/servers/create?error=${encodeURIComponent(error.message || 'Failed to create server.')}`);
    }
});

router.delete('/servers/:id', isAuthenticated, async (req: Request, res: Response) => {
    const userEmail = (req.session as AuthenticatedSessionData).user?.email;
    const serverId = req.params.id;

    if (!userEmail) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }

    try {
        const pteroUser = await findUserByEmail(userEmail);
        if (!pteroUser) {
            res.status(404).json({ error: 'Could not find associated panel user.' });
            return;
        }

        const servers = await listUserServers(pteroUser.id);
        const serverToDelete = servers.find(server => server.attributes.uuid === serverId);

        if (!serverToDelete) {
            res.status(404).json({ error: 'Server not found or you do not have permission to delete it.' });
            return;
        }

        const deleteResponse = await fetch(`${process.env.PANEL_URL}/api/application/servers/${serverToDelete.attributes.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${process.env.PANEL_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!deleteResponse.ok) {
            throw new Error(`Failed to delete server: ${deleteResponse.statusText}`);
        }

        res.json({ success: true });
        return;

    } catch (error: any) {
        console.error(`Failed to delete server for user ${userEmail}:`, error.message);
        res.status(500).json({ error: 'Failed to delete server.' });
        return;
    }
});

router.get('/servers/:id/status', isAuthenticated, async (req: Request, res: Response) => {
    const userEmail = (req.session as AuthenticatedSessionData).user?.email;
    const serverId = req.params.id;

    if (!userEmail) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }

    try {
        const pteroUser = await findUserByEmail(userEmail);
        if (!pteroUser) {
            res.status(404).json({ error: 'Could not find associated panel user.' });
            return;
        }

        const servers = await listUserServers(pteroUser.id);
        const server = servers.find(s => s.attributes.uuid === serverId);

        if (!server) {
            res.status(404).json({ error: 'Server not found or you do not have permission to view it.' });
            return;
        }
        
        const status = await getServerStatus(server.attributes.identifier);
        res.json(status);

    } catch (error: any) {
        console.error(`Failed to get server status for ${serverId}:`, error.message);
        res.status(500).json({ error: 'Failed to get server status', status: 'error' });
    }
});

export default router;
