import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config(); 

const PANEL_URL = process.env.PANEL_URL;
const PANEL_API_KEY = process.env.PANEL_API_KEY;
const PANEL_CLIENT_KEY = process.env.PANEL_CLIENT_KEY;

if (!PANEL_URL || !PANEL_API_KEY) {
    console.error("Pterodactyl PANEL_URL or PANEL_API_KEY not found in .env file. API calls will fail.");
}

if (!PANEL_CLIENT_KEY) {
    console.error("PANEL_CLIENT_KEY not found in .env file. Client API calls will fail.");
}

const apiClient = axios.create({
    baseURL: `${PANEL_URL}/api/application`,
    headers: {
        'Authorization': `Bearer ${PANEL_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    timeout: 10000,
});

const clientApiClient = axios.create({
    baseURL: `${PANEL_URL}/api/client`,
    headers: {
        'Authorization': `Bearer ${PANEL_CLIENT_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    timeout: 10000,
});

interface PteroUser {
    id: number;
    uuid: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    language: string;
    root_admin: boolean;
    '2fa': boolean;
    created_at: string;
    updated_at: string;
}

interface CreateUserOptions {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    password?: string;
    isAdmin?: boolean;
}

interface UpdateUserOptions {
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    password?: string;
    isAdmin?: boolean;
}

interface CreateServerOptions {
    name: string;
    description?: string | null;
    ownerId: number;
    eggId: number;
    dockerImage: string;
    startupCommand: string;
    limits: {
        memory: number;
        swap: number;
        disk: number;
        io: number;
        cpu: number;
    };
    featureLimits: {
        databases: number;
        allocations: number;
        backups: number;
    };
    allocationId: number;
    environment?: Record<string, any>;
}

export async function createUser(options: CreateUserOptions): Promise<PteroUser> {
    if (!PANEL_URL || !PANEL_API_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }

    try {
        const response = await apiClient.post('/users', {
            username: options.username,
            email: options.email,
            first_name: options.firstName,
            last_name: options.lastName,
            password: options.password,
            root_admin: options.isAdmin ?? false,
            external_id: null,
        });

        if (response.status === 201 && response.data?.object === 'user') {
            console.log(`Successfully created Pterodactyl user: ${options.username}`);
            return response.data.attributes as PteroUser;
        } else {
            console.error("Unexpected successful response structure from Pterodactyl:", response.status, response.data);
            throw new Error(`Unexpected response status ${response.status} when creating user.`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error creating Pterodactyl user ${options.username}:`, error.response?.status, error.response?.data);
            const errorData = error.response?.data as any;
            const errorMessage = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error';
            throw new Error(`Pterodactyl API Error: ${errorMessage}`);
        } else {
            console.error("Non-Axios error creating Pterodactyl user:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}

export async function findUserByEmail(email: string): Promise<PteroUser | null> {
    if (!PANEL_URL || !PANEL_API_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }
    try {
        const response = await apiClient.get('/users', {
            params: { 'filter[email]': email }
        });

        if (response.status === 200 && response.data?.data?.length > 0) {
            return response.data.data[0].attributes as PteroUser;
        } else if (response.status === 200 && response.data?.data?.length === 0) {
            return null;
        } else {
            console.error("Unexpected response structure when finding user by email:", response.status, response.data);
            throw new Error(`Unexpected response status ${response.status} when finding user.`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response?.status !== 404) {
                console.error(`Error finding Pterodactyl user ${email}:`, error.response?.status, error.response?.data);
                const errorData = error.response?.data as any;
                const errorMessage = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error';
                throw new Error(`Pterodactyl API Error: ${errorMessage}`);
            }
            return null;
        } else {
            console.error("Non-Axios error finding Pterodactyl user:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}

export async function updateUser(userId: number, options: UpdateUserOptions): Promise<PteroUser> {
    if (!PANEL_URL || !PANEL_API_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }
    try {
        const payload: any = {};
        if (options.username !== undefined) payload.username = options.username;
        if (options.email !== undefined) payload.email = options.email;
        if (options.firstName !== undefined) payload.first_name = options.firstName;
        if (options.lastName !== undefined) payload.last_name = options.lastName;
        if (options.password !== undefined) payload.password = options.password;
        if (options.isAdmin !== undefined) payload.root_admin = options.isAdmin;

        const response = await apiClient.patch(`/users/${userId}`, payload);

        if (response.status === 200 && response.data?.object === 'user') {
            console.log(`Successfully updated Pterodactyl user ID: ${userId}`);
            return response.data.attributes as PteroUser;
        } else {
            console.error("Unexpected successful response structure from Pterodactyl update:", response.status, response.data);
            throw new Error(`Unexpected response status ${response.status} when updating user.`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error updating Pterodactyl user ${userId}:`, error.response?.status, error.response?.data);
            const errorData = error.response?.data as any;
            const errorMessage = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error';
            throw new Error(`Pterodactyl API Error: ${errorMessage}`);
        } else {
            console.error("Non-Axios error updating Pterodactyl user:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}

export async function listUserServers(userId: number): Promise<any[]> {
    if (!PANEL_URL || !PANEL_API_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }
    try {
        const response = await apiClient.get('/servers');

        if (response.status === 200 && Array.isArray(response.data?.data)) {
            const userServers = response.data.data.filter((server: any) => server.attributes.user === userId);
            return userServers;
        } else {
            console.error("Unexpected response structure when listing user servers:", response.status, response.data);
            throw new Error(`Unexpected response status ${response.status} when listing servers.`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error listing servers for Pterodactyl user ${userId}:`, error.response?.status, error.response?.data);
            const errorData = error.response?.data as any;
            const errorMessage = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error';
            throw new Error(`Pterodactyl API Error: ${errorMessage}`);
        } else {
            console.error("Non-Axios error listing Pterodactyl user servers:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}

export async function deleteUser(userId: number): Promise<void> {
    if (!PANEL_URL || !PANEL_API_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }
    try {
        const response = await apiClient.delete(`/users/${userId}`);

        if (response.status === 204) {
            console.log(`Successfully deleted Pterodactyl user ID: ${userId}`);
            return;
        } else {
            console.error("Unexpected successful response structure from Pterodactyl delete:", response.status, response.data);
            throw new Error(`Unexpected response status ${response.status} when deleting user.`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error deleting Pterodactyl user ${userId}:`, error.response?.status, error.response?.data);
            const errorData = error.response?.data as any;
            const errorMessage = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error';
            throw new Error(`Pterodactyl API Error: ${errorMessage}`);
        } else {
            console.error("Non-Axios error deleting Pterodactyl user:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}

export async function listAllocations(nodeId: number): Promise<any[]> {
    if (!PANEL_URL || !PANEL_API_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }
    try {
        const response = await apiClient.get(`/nodes/${nodeId}/allocations`);

        if (response.status === 200 && Array.isArray(response.data?.data)) {
            return response.data.data;
        } else {
            console.error("Unexpected response structure when listing allocations:", response.status, response.data);
            throw new Error(`Unexpected response status ${response.status} when listing allocations.`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error listing allocations for node ${nodeId}:`, error.response?.status, error.response?.data);
            const errorData = error.response?.data as any;
            const errorMessage = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error';
            throw new Error(`Pterodactyl API Error: ${errorMessage}`);
        } else {
            console.error("Non-Axios error listing allocations:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}

export async function createPteroServer(options: CreateServerOptions): Promise<any> {
    if (!PANEL_URL || !PANEL_API_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }
    try {
        const payload = {
            name: options.name,
            user: options.ownerId,
            egg: options.eggId,
            docker_image: options.dockerImage,
            startup: options.startupCommand,
            limits: options.limits,
            feature_limits: options.featureLimits,
            description: options.description || '',
            environment: options.environment || {},
            allocation: {
                default: options.allocationId
            },
        };

        const response = await apiClient.post('/servers', payload);

        if (response.status === 201 && response.data?.object === 'server') {
            console.log(`Successfully created Pterodactyl server: ${options.name}`);
            return response.data.attributes;
        } else {
            console.error("Unexpected successful response structure from Pterodactyl server create:", response.status, response.data);
            throw new Error(`Unexpected response status ${response.status} when creating server.`);
        }

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error creating Pterodactyl server ${options.name}:`, error.response?.status, error.response?.data);
            const errorData = error.response?.data as any;
            const detail = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error during server creation.';
            throw new Error(`Pterodactyl API Error: ${detail}`);
        } else {
            console.error("Non-Axios error creating Pterodactyl server:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}

export async function getServerStatus(identifier: string): Promise<{ status: string }> {
    if (!PANEL_URL || !PANEL_API_KEY || !PANEL_CLIENT_KEY) {
        throw new Error("Pterodactyl API is not configured in .env");
    }
    try {
        const serverResponse = await apiClient.get('/servers', {
            params: { 'filter[uuid]': identifier }
        });
        
        if (serverResponse.status === 200 && serverResponse.data?.data?.length > 0) {
            const server = serverResponse.data.data[0];
            const isInstalled = server.attributes?.container?.installed;
            
            if (!isInstalled) {
                return { status: 'installing' };
            }

            try {
                const resourceResponse = await clientApiClient.get(`/servers/${server.attributes.identifier}/resources`);
                if (resourceResponse.status === 200) {
                    return {
                        status: resourceResponse.data.attributes?.current_state || 'offline'
                    };
                }
            } catch (resourceError) {
                if (axios.isAxiosError(resourceError) && resourceError.response?.status === 404) {
                    return { status: 'installing' };
                }
                throw resourceError;
            }
        }

        return { status: 'error' };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error getting server status ${identifier}:`, error.response?.status, error.response?.data);
            const errorData = error.response?.data as any;
            const errorMessage = errorData?.errors?.[0]?.detail || error.message || 'Unknown Pterodactyl API error';
            throw new Error(`Pterodactyl API Error: ${errorMessage}`);
        } else {
            console.error("Non-Axios error getting server status:", error);
            throw new Error("An unexpected error occurred while contacting the Pterodactyl API.");
        }
    }
}
