const canvas = document.getElementById('mrbdCanvas');
const ctx = canvas.getContext('2d');

// Engine Modes: 'BOOT', 'HUD', 'MAP'
let currentMode = 'BOOT'; 

// Menu Focus Nodes: 0 = Top Slider, 1 = Center Canvas, 2 = Bottom Button
let activeFocusNode = 1; 

// Hardware Metrics
let userLat = null;
let userLon = null;
let headHeading = 0;   // Yaw (Left/Right)
let headPitch = 0;     // Beta (Up/Down incline angle)

// Operational Variables
let nearbyFlights = [];
let systemStatus = "CALIBRATION REQUIRED";
let squarePerimeterSide = 15; // Starting boundary radius in miles

// --- 1. SECURE HARDWARE HANDSHAKE ---
async function triggerHardwareHandshake() {
    systemStatus = "AUTHORIZING...";
    
    // Request unthrottled iOS/Android proxy permission for the IMU
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceOrientationEvent.requestPermission();
            if (permissionState === 'granted') attachIMU();
        } catch (e) { systemStatus = "IMU_AUTH_FAIL"; }
    } else {
        attachIMU();
    }

    // Initialize Precise GPS Tracking
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((position) => {
            userLat = position.coords.latitude;
            userLon = position.coords.longitude;
            systemStatus = "ONLINE";
            if (currentMode === 'BOOT') currentMode = 'HUD'; // Automatic System Advance
            fetchFlightData();
        }, (err) => {
            systemStatus = "GPS_ERROR";
        }, { enableHighAccuracy: true, timeout: 15000 });
    }
}

function attachIMU() {
    window.addEventListener('deviceorientation', (event) => {
        // True compass mapping
        if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
            headHeading = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            headHeading = 360 - event.alpha;
        }
        
        // Pitch mapping (up/down shift tracking)
        if (event.beta !== null) {
            headPitch = event.beta; 
        }
    }, true);
}

// --- 2. MULTI-AXIS CONTROL GESTURES ---
window.addEventListener('keydown', (e) => {
    if (currentMode === 'BOOT') {
        if (e.key === 'Enter') triggerHardwareHandshake();
        return;
    }

    if (e.key === 'ArrowUp' && activeFocusNode > 0) activeFocusNode--;
    else if (e.key === 'ArrowDown' && activeFocusNode < 2) activeFocusNode++;
    else if (e.key === 'ArrowRight' && activeFocusNode === 0) {
        squarePerimeterSide = Math.min(squarePerimeterSide + 1, 50);
        fetchFlightData();
    } 
    else if (e.key === 'ArrowLeft' && activeFocusNode === 0) {
        squarePerimeterSide = Math.max(squarePerimeterSide - 1, 5);
        fetchFlightData();
    } 
    else if (e.key === 'Enter' && activeFocusNode === 2) {
        currentMode = (currentMode === 'HUD') ? 'MAP' : 'HUD';
        activeFocusNode = 1;
    }
});

// --- 3. FLIGHT TRAFFIC AGGREGATOR (ADS-B Box Mapping) ---
async function fetchFlightData() {
    if (!userLat || !userLon) return;
    const degreeDelta = (squarePerimeterSide / 2) / 69;
    const url = `https://opensky-network.org/api/states/all?lamin=${userLat - degreeDelta}&lomin=${userLon - degreeDelta}&lamax=${userLat + degreeDelta}&lomax=${userLon + degreeDelta}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.states) {
            nearbyFlights = data.states.map(flight => ({
                callsign: flight[1].trim() || "UNK",
                lon: flight[5],
                lat: flight[6],
                altitude: flight[7] ? Math.round(flight[7] * 3.28084) : 0, 
            })).filter(f => f.lat && f.lon);
        } else { nearbyFlights = []; }
    } catch (e) { console.error("API Throttled"); }
}
setInterval(fetchFlightData, 12000);

// --- 4. 3D SPATIAL AR MATH ---
function calculateTargetVectors(lat1, lon1, lat2, lon2, altFeet) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const distanceMiles = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));

    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    let bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    // Elevation/Incline Calculation
    const altMiles = altFeet / 5280;
    const inclineDegrees = Math.atan2(altMiles, distanceMiles) * (180 / Math.PI);

    return { distance: distanceMiles, bearing: bearing, incline: inclineDegrees };
}

// --- 5. SYSTEM RENDER PIPELINE ---
function runEngine() {
    ctx.clearRect(0, 0, 600, 600);
    const cx = 300, cy = 300;
    const neonCyan = '#00f0ff';
    const activeGold = '#ffb700';

    if (currentMode === 'BOOT') {
        // System Calibration Request Display
        ctx.fillStyle = neonCyan;
        ctx.font = 'bold 22px monospace';
        ctx.fillText("STARK INDUSTRIES OS v4.2", 50, 200);
        ctx.font = '16px monospace';
        ctx.fillText(`STATUS: ${systemStatus}`, 50, 240);
        ctx.fillStyle = activeGold;
        ctx.fillText("TAP STRIP / ENTIRE TRIGGER TO HANDSHAKE SENSORS", 50, 340);
        requestAnimationFrame(runEngine);
        return;
    }

    // RENDER COMMON INTERFACE HEADER: Slider Component
    ctx.lineWidth = 2;
    ctx.strokeStyle = (activeFocusNode === 0) ? activeGold : neonCyan;
    ctx.strokeRect(50, 25, 500, 10);
    const handleX = 50 + (((squarePerimeterSide - 5) / 45) * 500);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(handleX - 8, 18, 16, 24);
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`PERIMETER BOUNDARY: ${squarePerimeterSide}x${squarePerimeterSide} MI`, 50, 65);

    if (currentMode === 'HUD') {
        // ---------------- 3D HUD GRAPHICS OVERLAY ----------------
        ctx.strokeStyle = neonCyan;
        ctx.beginPath(); ctx.arc(cx, cy, 35, 0, Math.PI * 2); ctx.stroke(); // Static central reticle

        nearbyFlights.forEach(plane => {
            const vectors = calculateTargetVectors(userLat, userLon, plane.lat, plane.lon, plane.altitude);
            
            if (vectors.distance <= (squarePerimeterSide / 2)) {
                // Compute Spatial Canvas Coordinates (Yaw Offset + Pitch Offset)
                const relativeYawRad = (vectors.bearing - headHeading) * Math.PI / 180;
                
                // Track spatial vertical offset relative to chin pitch incline angle
                const relativePitchDeg = vectors.incline - headPitch;

                // Transform mathematical parameters cleanly onto the 2D matrix
                const pixelRadiusX = (Math.sin(relativeYawRad) * (vectors.distance / (squarePerimeterSide / 2))) * 240;
                const pixelRadiusY = (relativePitchDeg * 8); // 8px scale tracking per tilt unit degree

                const tx = cx + pixelRadiusX;
                const ty = cy - pixelRadiusY;

                // Ensure target box renders if within viewing field matrix limits
                if (tx > 20 && tx < 580 && ty > 80 && ty < 520) {
                    ctx.strokeRect(tx - 10, ty - 10, 20, 20);
                    ctx.font = 'bold 16px monospace';
                    ctx.fillText(plane.callsign, tx + 15, ty - 5);
                    ctx.font = '14px monospace';
                    ctx.fillText(`${vectors.distance.toFixed(1)}mi | H:${vectors.incline.round}°`, tx + 15, ty + 12);
                    ctx.fillText(`${plane.altitude}ft`, tx + 15, ty + 26);
                }
            }
        });
    } 
    else if (currentMode === 'MAP') {
        // ---------------- TACTICAL OVERHEAD GRID MAP ----------------
        ctx.fillStyle = '#06131c'; ctx.fillRect(40, 90, 520, 420);
        ctx.strokeStyle = '#002d3a';
        for (let g = 90; g <= 510; g += 42) {
            ctx.beginPath(); ctx.moveTo(40, g); ctx.lineTo(560, g); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(g - 50, 90); ctx.lineTo(g - 50, 510); ctx.stroke();
        }
        ctx.fillStyle = activeGold; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill(); // HQ Point

        ctx.fillStyle = neonCyan;
        nearbyFlights.forEach(plane => {
            const bounds = (squarePerimeterSide / 2) / 69;
            const mx = cx + ((plane.lon - userLon) / bounds) * 260;
            const my = cy - ((plane.lat - userLat) / bounds) * 210;
            if (mx >= 40 && mx <= 560 && my >= 90 && my <= 510) {
                ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
                ctx.font = 'bold 14px monospace'; ctx.fillText(plane.callsign, mx + 10, my + 4);
            }
        });
    }

    // RENDER INTERFACE FOOTER: Layout Switch Button Component
    ctx.strokeStyle = (activeFocusNode === 2) ? activeGold : neonCyan;
    ctx.fillStyle = (activeFocusNode === 2) ? 'rgba(0, 240, 255, 0.15)' : 'transparent';
    ctx.fillRect(150, 530, 300, 45); ctx.strokeRect(150, 530, 300, 45);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 18px monospace';
    const footerLabel = (currentMode === 'HUD') ? "OPEN TACTICAL MAP" : "CLOSE MAP / VIEW HUD";
    ctx.fillText(footerLabel, 300 - (ctx.measureText(footerLabel).width / 2), 558);

    requestAnimationFrame(runEngine);
}

// Global Launch
Number.prototype.round = function() { return Math.round(this); };
runEngine();
