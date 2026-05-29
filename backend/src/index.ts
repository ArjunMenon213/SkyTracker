import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketGateway } from './websocket/gateway';
import { FlightScheduler } from './services/flightScheduler';
import { ClientLocation } from './types/flight';

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;
const pollingInterval = parseInt(process.env.POLLING_INTERVAL || '10000');

// Middleware
app.use(cors());
app.use(express.json());

// WebSocket Gateway
const wsGateway = new WebSocketGateway(server);

// Flight Scheduler
const flightScheduler = new FlightScheduler(pollingInterval);

// Default user location (can be updated via API)
let userLocation: ClientLocation = {
  latitude: 37.7749,      // San Francisco
  longitude: -122.4194,
  altitude: 0,
  heading: 0,
  pitch: 0
};

// Subscribe to flight updates
flightScheduler.onFlightUpdate((flights) => {
  wsGateway.broadcastFlightUpdate(flights);
});

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    clients: wsGateway.getClientCount(),
    userLocation
  });
});

app.get('/stats', (req, res) => {
  res.json({
    connectedClients: wsGateway.getClientCount(),
    pollingInterval,
    userLocation,
    timestamp: new Date().toISOString()
  });
});

app.post('/location', (req, res) => {
  const { latitude, longitude, altitude, heading, pitch } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Missing latitude or longitude' });
  }

  userLocation = {
    latitude,
    longitude,
    altitude: altitude || 0,
    heading: heading || 0,
    pitch: pitch || 0
  };

  res.json({ success: true, userLocation });
  console.log(`📍 User location updated: ${latitude}, ${longitude}`);
});

app.get('/location', (req, res) => {
  res.json(userLocation);
});

// ==================== SERVER STARTUP ====================

server.listen(port, () => {
  console.log(`
╔════════════════════════════════════╗
║    🚁 SKYTRACKER AR BACKEND 🚁    ║
╚════════════════════════════════════╝

✅ Server running on: http://localhost:${port}
📡 WebSocket: ws://localhost:${port}
🔄 Polling Interval: ${pollingInterval}ms
📍 Default Location: ${userLocation.latitude}, ${userLocation.longitude}

🚀 Routes:
   GET  /health       - Check server status
   GET  /stats        - Get connection stats
   GET  /location     - Get user location
   POST /location     - Update user location (body: {latitude, longitude, altitude, heading, pitch})

🔌 WebSocket Events:
   OUT: flight_update - Broadcast of all nearby aircraft
   IN:  location_update - Client sends their position

  `);

  // Start flight scheduler
  flightScheduler.start(userLocation);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, shutting down gracefully...');
  flightScheduler.stop();
  wsGateway.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
