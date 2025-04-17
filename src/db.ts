import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set.');
}

let db: Db;
let client: MongoClient;

async function connectDB() {
    if (db) {
        return db;
    }
    try {
        client = new MongoClient(uri);
        await client.connect();
        console.log("Connected to MongoDB");
        const dbName = process.env.MONGODB_NAME;
        db = dbName ? client.db(dbName) : client.db();
        
        await initializeDatabase();
        
        return db;
    } catch (err) {
        console.error("Error connecting to MongoDB:", err);
        process.exit(1); 
    }
}

async function initializeDatabase() {
    try {
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        if (!collectionNames.includes('users')) {
            await db.createCollection('users');
            await db.collection('users').createIndex({ username: 1 }, { unique: true });
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            console.log("Users collection and indexes created.");
        } else {
            console.log("Users collection already exists.");
        }

        if (!collectionNames.includes('servers')) {
            await db.createCollection('servers');
            await db.collection('servers').createIndex({ pterodactylId: 1 }, { unique: true });
             await db.collection('servers').createIndex({ ownerId: 1 }); 
            console.log("Servers collection and indexes created.");
        } else {
            console.log("Servers collection already exists.");
        }
    } catch (err) {
        console.error("Error initializing database collections:", err);
    }
}


export { connectDB, db, client };
