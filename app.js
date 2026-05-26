// =============================================
//  THERAFLEX WEB — Motor Principal
//  Stack: Vanilla JS · Web Serial API · Canvas
// =============================================

// =============================================
// 1. CLASE DSP — Procesamiento de señal EMG
// =============================================
class SignalProcessor {
    constructor() {
        this.movingAvg  = [];
        this.maxLen     = 30;
        this.dcOffset   = 0;
        this.alphaDC    = 0.05;
        this.vPrev      = 0;
        this.vOut       = 0;
    }

    process(rawVal) {
        const val = parseFloat(rawVal);
        if (isNaN(val)) return 0.0;

        // 1. Eliminación de offset DC
        this.dcOffset = (1.0 - this.alphaDC) * this.dcOffset + this.alphaDC * val;
        const acVal   = val - this.dcOffset;

        // 2. Filtro pasa-altas simple
        this.vOut  = 0.5 * (acVal + this.vPrev);
        this.vPrev = acVal;

        // 3. Rectificación + amplificación
        const amplified = Math.abs(this.vOut) * 1.5;

        // 4. Promedio móvil (suavizado)
        this.movingAvg.push(amplified);
        if (this.movingAvg.length > this.maxLen) this.movingAvg.shift();
        return this.movingAvg.reduce((a, b) => a + b, 0) / this.movingAvg.length;
    }

    reset() {
        this.movingAvg = [];
        this.dcOffset  = 0;
        this.vPrev     = 0;
        this.vOut      = 0;
    }
}

// =============================================
// 2. REFERENCIAS DOM
// =============================================
const $ = id => document.getElementById(id);

const splashDiv   = $('splashDiv');
const menuDiv     = $('menuDiv');
const gameDiv     = $('gameDiv');
const topBar      = $('topBar');
const btnConectar = $('btnConectar');
const lblStatus   = $('lblStatus');
const lblValor    = $('lblValor');
const lblUmbral   = $('lblUmbral');
const lblReps     = $('lblReps');
const lblTimer    = $('lblTimer');
const emgBar      = $('emgBar');

const canvas = $('gameCanvas');
const ctx    = canvas.getContext('2d');
const W      = canvas.width;
const H      = canvas.height;

// =============================================
// 3. ESTADO GLOBAL
// =============================================
const dsp = new SignalProcessor();

let port, reader;
let processedVal = 0.0;

// Calibración
let minNoise      = 0.0;
let maxSignal     = 50.0;
let threshold     = 10.0;

// Estados
const STATE_MENU  = 0;
const STATE_CAL   = 1;
const STATE_PLAY  = 2;

let appState  = STATE_MENU;
let gameMode  = null;
let reps      = 0;

// Variables de calibración
let calStep   = 0;
let calTimer  = 0;
let calBuffer = [];

// Timer de sesión
let sessionStart = 0;

// =============================================
// 4. FÍSICA DEL JUEGO 1 — Valores terapéuticos
// =============================================
const GROUND_OFFSET = 150;           // px desde abajo
const GRAVITY       = 0.65;          // Caída más rápida (arco corto y predecible)
const JUMP_FORCE    = -13;           // Altura suficiente para esquivar
const OBS_SPEED     = 1.5;           // px/frame — avance lento (fácil)
const OBS_MIN_GAP   = 4500;          // ms mínimo entre obstáculos (más tiempo)
const OBS_RAND_GAP  = 2500;          // ms aleatorio adicional
const JUMP_COOLDOWN = 800;           // ms mínimos entre saltos (evita doble salto)

let playerY          = 0;
let playerVel        = 0;
let obstacles        = [];
let lastJumpTime     = 0;
let lastObsTime      = 0;
let prevAboveThresh  = false;  // Para detección de flanco de subida (rising edge)

// =============================================
// 5. UTILIDADES DE DIBUJO
// =============================================

/** Dibuja texto con drop-shadow para legibilidad sobre canvas */
function drawText(text, x, y, opts = {}) {
    ctx.save();
    ctx.font        = opts.font    || '16px Outfit, Arial';
    ctx.fillStyle   = opts.color   || '#ffffff';
    ctx.textAlign   = opts.align   || 'center';
    ctx.textBaseline= opts.baseline|| 'middle';
    if (opts.shadow !== false) {
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur  = 8;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
}

/** Dibuja una barra de progreso con esquinas redondeadas */
function drawProgressBar(x, y, width, height, progress, color) {
    ctx.save();
    // Fondo
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fill();
    // Relleno
    if (progress > 0) {
        ctx.fillStyle = color;
        roundRect(ctx, x, y, Math.min(width * progress, width), height, height / 2);
        ctx.fill();
        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur  = 14;
        roundRect(ctx, x, y, Math.min(width * progress, width), height, height / 2);
        ctx.fill();
    }
    ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
}

// =============================================
// 6. GESTIÓN DE PANTALLAS
// =============================================
function showScreen(name) {
    [splashDiv, menuDiv, gameDiv].forEach(el => {
        el.style.display = 'none';
    });
    if (name === 'splash')  { splashDiv.style.display = 'flex'; topBar.style.display = 'none'; }
    if (name === 'menu')    { menuDiv.style.display   = 'flex'; topBar.style.display = 'flex'; }
    if (name === 'game')    { gameDiv.style.display   = 'flex'; topBar.style.display = 'flex'; }
}

function goToMenu() {
    appState = STATE_MENU;
    showScreen('menu');
    $('lblCalibracion').innerText =
        `Reposo: ${minNoise.toFixed(1)} · Máx: ${maxSignal.toFixed(1)} · Umbral: ${threshold.toFixed(1)}`;
}

function startGame(mode) {
    gameMode   = mode;
    appState   = STATE_PLAY;
    reps       = 0;
    playerY    = H - GROUND_OFFSET;
    playerVel  = 0;
    obstacles  = [];
    lastObsTime = Date.now() + 2000; // pequeña pausa inicial
    sessionStart = Date.now();
    lblReps.innerText = 'REPS: 0';
    showScreen('game');
}

function startCalibration() {
    appState  = STATE_CAL;
    calStep   = 0;
    calTimer  = Date.now();
    calBuffer = [];
    dsp.reset();
    showScreen('game');
}

// =============================================
// 7. EVENTOS DE BOTONES
// =============================================
btnConectar.addEventListener('click', connectSerial);
$('btnCalibrar').addEventListener('click', startCalibration);
$('btnJuego1').addEventListener('click', () => startGame(1));
$('btnJuego2').addEventListener('click', () => {});  // próximamente
$('btnJuego3').addEventListener('click', () => {});  // próximamente

// Teclado: ESC vuelve al menú desde el juego
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && appState === STATE_PLAY) goToMenu();
});

// =============================================
// 8. LOOP PRINCIPAL (60 FPS)
// =============================================
function loop() {
    const now = Date.now();
    ctx.clearRect(0, 0, W, H);

    if (appState === STATE_CAL)  drawCalibration(now);
    if (appState === STATE_PLAY && gameMode === 1) drawGame1(now);

    // Actualizar timer de sesión
    if (appState !== STATE_MENU && sessionStart > 0) {
        const elapsed = Math.floor((now - sessionStart) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        lblTimer.innerText = `${mm}:${ss}`;
    }

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// =============================================
// 9. PANTALLA DE CALIBRACIÓN
// =============================================
function drawCalibration(now) {
    ctx.textAlign = 'center';

    // Fondo sutil
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 400);
    grad.addColorStop(0, 'rgba(20,24,35,0.95)');
    grad.addColorStop(1, 'rgba(8,10,15,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // --- Paso 0: Espera inicial ---
    if (calStep === 0) {
        drawText('ASISTENTE DE CALIBRACIÓN', W/2, H/2 - 100,
            { font: 'bold 30px Outfit', color: '#ff9d45' });
        drawText('Siéntate cómodo y relaja el brazo.', W/2, H/2 - 50,
            { font: '18px Outfit', color: '#f0f4ff' });

        const pct = Math.min((now - calTimer) / 3000, 1);
        drawText(`Iniciando en ${Math.ceil(3 - pct * 3)}s`, W/2, H/2 + 20,
            { font: '14px Outfit', color: '#8a9bb5' });
        drawProgressBar(W/2 - 220, H/2 + 50, 440, 8, pct, '#ff9d45');

        if (pct >= 1) { calStep = 1; calTimer = now; calBuffer = []; }
    }

    // --- Paso 1: Relajación ---
    else if (calStep === 1) {
        const pct = Math.min((now - calTimer) / 3000, 1);

        drawText('FASE 1 · RELAJACIÓN', W/2, H/2 - 110,
            { font: 'bold 28px Outfit', color: '#00e5cc' });
        drawText('Deja el brazo completamente RELAJADO', W/2, H/2 - 65,
            { font: '18px Outfit', color: '#f0f4ff' });

        // Valor actual en vivo
        drawText(processedVal.toFixed(1), W/2, H/2 + 10,
            { font: 'bold 48px JetBrains Mono', color: '#00e5cc' });
        drawText('señal EMG actual', W/2, H/2 + 50,
            { font: '13px Outfit', color: '#8a9bb5' });

        drawProgressBar(W/2 - 220, H/2 + 90, 440, 8, pct, '#00e5cc');
        drawText(`${Math.ceil(3 - pct * 3)}s`, W/2, H/2 + 120,
            { font: '13px Outfit', color: '#8a9bb5' });

        calBuffer.push(processedVal);

        if (pct >= 1) {
            minNoise = Math.max(...calBuffer);
            calStep  = 2;
            calTimer = now;
            calBuffer = [];
        }
    }

    // --- Paso 2: Contracción máxima ---
    else if (calStep === 2) {
        const pct = Math.min((now - calTimer) / 3000, 1);

        // Efecto pulsante de urgencia
        const pulse = 0.85 + 0.15 * Math.sin(now / 150);
        drawText('FASE 2 · CONTRACCIÓN MÁXIMA', W/2, H/2 - 110,
            { font: 'bold 28px Outfit', color: `rgba(224,85,119,${pulse})` });
        drawText('¡CONTRAE EL MÚSCULO AL MÁXIMO!', W/2, H/2 - 65,
            { font: 'bold 20px Outfit', color: '#f0f4ff' });

        // Barra de fuerza en tiempo real
        const forcePct = maxSignal > 0 ? Math.min(processedVal / maxSignal, 1) : 0;
        drawProgressBar(W/2 - 220, H/2 - 20, 440, 30, forcePct, '#e05577');
        drawText(`${processedVal.toFixed(1)}`, W/2, H/2 + 30,
            { font: 'bold 42px JetBrains Mono', color: '#e05577' });

        drawProgressBar(W/2 - 220, H/2 + 90, 440, 8, pct, '#e05577');
        drawText(`${Math.ceil(3 - pct * 3)}s`, W/2, H/2 + 120,
            { font: '13px Outfit', color: '#8a9bb5' });

        calBuffer.push(processedVal);

        if (pct >= 1) {
            maxSignal    = Math.max(...calBuffer, minNoise + 1);
            const diff   = maxSignal - minNoise;
            threshold    = minNoise + diff * 0.25;
            lblUmbral.innerText = threshold.toFixed(1);
            calStep      = 3;
            calTimer     = now;
        }
    }

    // --- Paso 3: Éxito ---
    else if (calStep === 3) {
        drawText('✓  CALIBRACIÓN EXITOSA', W/2, H/2 - 80,
            { font: 'bold 32px Outfit', color: '#00e5cc' });

        drawText(`Ruido base: ${minNoise.toFixed(1)}`, W/2, H/2 - 20,
            { font: '16px JetBrains Mono', color: '#8a9bb5' });
        drawText(`Señal máx: ${maxSignal.toFixed(1)}`, W/2, H/2 + 15,
            { font: '16px JetBrains Mono', color: '#8a9bb5' });

        const thresholdGrad = ctx.createLinearGradient(W/2 - 100, 0, W/2 + 100, 0);
        thresholdGrad.addColorStop(0, '#00e5cc');
        thresholdGrad.addColorStop(1, '#bb86fc');
        ctx.font = 'bold 28px Outfit';
        ctx.fillStyle = thresholdGrad;
        ctx.textAlign = 'center';
        ctx.fillText(`UMBRAL  →  ${threshold.toFixed(1)}`, W/2, H/2 + 65);

        // Countdown para volver al menú
        const remaining = Math.max(0, 4 - Math.floor((now - calTimer) / 1000));
        drawText(`Volviendo al menú en ${remaining}s...`, W/2, H/2 + 120,
            { font: '13px Outfit', color: '#4a5568' });

        if (now - calTimer > 4000) goToMenu();
    }
}

// =============================================
// 10. JUEGO 1 — COORDINACIÓN MOTRIZ
// =============================================
function drawGame1(now) {
    const groundY = H - GROUND_OFFSET;

    // --- Dibujar fondo degradado ---
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#080a0f');
    bgGrad.addColorStop(1, '#0d1220');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Estrellas de fondo (decorativas, estáticas)
    drawStars();

    // --- Suelo ---
    drawGround(groundY);

    // --- Física del jugador ---
    // Rising-edge: solo salta en el momento que la señal CRUZA el umbral hacia arriba
    const currAbove = processedVal > threshold;
    const risingEdge = currAbove && !prevAboveThresh;
    prevAboveThresh = currAbove;

    if (risingEdge && playerY >= groundY && (now - lastJumpTime) > JUMP_COOLDOWN) {
        playerVel    = JUMP_FORCE;
        lastJumpTime = now;
        reps++;
        lblReps.innerText = `REPS: ${reps}`;
    }

    playerVel += GRAVITY;
    playerY   += playerVel;
    if (playerY > groundY) { playerY = groundY; playerVel = 0; }

    // --- Spawn de obstáculos ---
    if (now - lastObsTime > OBS_MIN_GAP + Math.random() * OBS_RAND_GAP) {
        obstacles.push({ x: W + 10, passed: false });
        lastObsTime = now;
    }

    // --- Mover, dibujar obstáculos y colisiones ---
    const OBS_W = 28, OBS_H = 48;
    const playerR = 18;
    const playerX = 120;
    // Hitbox más generosa (margen de 10px) para que el juego sea más fácil
    const HIT_MARGIN = 10;

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.x -= OBS_SPEED;

        drawObstacle(obs.x, groundY, OBS_W, OBS_H);

        // Colisión con hitbox reducida (más fácil de esquivar)
        const hit =
            playerX + playerR - HIT_MARGIN > obs.x + HIT_MARGIN &&
            playerX - playerR + HIT_MARGIN < obs.x + OBS_W - HIT_MARGIN &&
            playerY - playerR + HIT_MARGIN > groundY - OBS_H + HIT_MARGIN;

        if (hit) {
            triggerGameOver();
            return;
        }

        if (!obs.passed && obs.x + OBS_W < playerX - playerR) {
            obs.passed = true;
        }

        if (obs.x < -60) obstacles.splice(i, 1);
    }

    // --- Dibujar jugador ---
    drawPlayer(playerX, playerY, playerR, processedVal > threshold);

    // --- HUD en canvas ---
    drawHUD(groundY);
}

// ------ Sub-renders del Juego 1 ------

let stars = null;
function drawStars() {
    if (!stars) {
        stars = [];
        for (let i = 0; i < 80; i++) {
            stars.push({ x: Math.random() * W, y: Math.random() * (H * 0.6), r: Math.random() * 1.2 + 0.3, o: Math.random() * 0.4 + 0.1 });
        }
    }
    ctx.save();
    stars.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,210,255,${s.o})`;
        ctx.fill();
    });
    ctx.restore();
}

function drawGround(groundY) {
    // Línea de suelo con glow
    const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(0.2, 'rgba(0,229,204,0.7)');
    lineGrad.addColorStop(0.8, 'rgba(187,134,252,0.7)');
    lineGrad.addColorStop(1, 'transparent');
    ctx.save();
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#00e5cc';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 2);
    ctx.lineTo(W, groundY + 2);
    ctx.stroke();
    ctx.restore();
}

function drawPlayer(x, y, r, isContracting) {
    ctx.save();

    // Sombra de suelo
    ctx.beginPath();
    ctx.ellipse(x, H - GROUND_OFFSET + 6, r * 1.2, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(187,134,252,0.2)';
    ctx.fill();

    // Glow exterior cuando contrae
    if (isContracting) {
        ctx.shadowColor = '#bb86fc';
        ctx.shadowBlur  = 28;
    }

    // Cuerpo del jugador
    const pGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    pGrad.addColorStop(0, '#d4a8ff');
    pGrad.addColorStop(1, '#7a3fd4');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pGrad;
    ctx.fill();

    // Borde
    ctx.strokeStyle = isContracting ? '#ffffff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth   = isContracting ? 2.5 : 1.5;
    ctx.stroke();

    ctx.restore();
}

function drawObstacle(x, groundY, w, h) {
    ctx.save();

    // Glow rojo
    ctx.shadowColor = '#e05577';
    ctx.shadowBlur  = 16;

    // Cuerpo como triángulo con relleno gradiente
    const oGrad = ctx.createLinearGradient(x, groundY - h, x + w, groundY);
    oGrad.addColorStop(0, '#ff6e8a');
    oGrad.addColorStop(1, '#8b1a2e');

    ctx.beginPath();
    ctx.moveTo(x + w / 2, groundY - h);
    ctx.lineTo(x + w, groundY);
    ctx.lineTo(x, groundY);
    ctx.closePath();
    ctx.fillStyle = oGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,150,170,0.5)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.restore();
}

function drawHUD(groundY) {
    ctx.save();

    // Panel HUD semi-transparente (esquina sup. derecha)
    const hudX = W - 200, hudY = 14, hudW = 186, hudH = 70;
    ctx.fillStyle = 'rgba(8,10,15,0.55)';
    roundRect(ctx, hudX, hudY, hudW, hudH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Barra de señal EMG
    const maxDisplay = Math.max(maxSignal, 1);
    const pct = Math.min(processedVal / maxDisplay, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, hudX + 12, hudY + 12, 162, 6, 3);
    ctx.fill();
    const barColor = processedVal > threshold ? '#00e5cc' : '#bb86fc';
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 8;
    roundRect(ctx, hudX + 12, hudY + 12, 162 * pct, 6, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Valores
    ctx.font = '11px JetBrains Mono';
    ctx.fillStyle = '#8a9bb5';
    ctx.textAlign = 'left';
    ctx.fillText(`EMG  ${processedVal.toFixed(1)}`, hudX + 12, hudY + 34);
    ctx.fillText(`UMB  ${threshold.toFixed(1)}`, hudX + 12, hudY + 52);

    // Indicador de activación
    if (processedVal > threshold) {
        ctx.fillStyle = 'rgba(0,229,204,0.15)';
        roundRect(ctx, hudX + 110, hudY + 28, 76, 30, 6);
        ctx.fill();
        ctx.font = 'bold 11px Outfit';
        ctx.fillStyle = '#00e5cc';
        ctx.textAlign = 'center';
        ctx.fillText('ACTIVO', hudX + 148, hudY + 44);
    }

    // Instrucción ESC
    ctx.font = '11px Outfit';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.textAlign = 'left';
    ctx.fillText('ESC  →  Menú', 14, 24);

    ctx.restore();
}

// =============================================
// 11. GAME OVER
// =============================================
function triggerGameOver() {
    appState = STATE_MENU;

    // Overlay de Game Over antes de volver al menú
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,15,0.85)';
    ctx.fillRect(0, 0, W, H);

    drawText('COLISIÓN', W/2, H/2 - 60,
        { font: 'bold 42px Outfit', color: '#e05577' });
    drawText(`Repeticiones logradas: ${reps}`, W/2, H/2,
        { font: '20px Outfit', color: '#f0f4ff' });
    drawText('Volviendo al menú...', W/2, H/2 + 50,
        { font: '14px Outfit', color: '#8a9bb5' });
    ctx.restore();

    setTimeout(() => goToMenu(), 2200);
}

// =============================================
// 12. BARRA EMG (bottom bar) — actualización
// =============================================
function updateEMGBar() {
    const maxD = Math.max(maxSignal, 1);
    const pct  = Math.min((processedVal / maxD) * 100, 100);
    emgBar.style.width = `${pct}%`;
}

// =============================================
// 13. CONEXIÓN WEB SERIAL
// =============================================
async function connectSerial() {
    if (!navigator.serial) {
        lblStatus.innerText = 'Web Serial no soportado';
        lblStatus.style.color = '#e05577';
        return;
    }
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        lblStatus.innerText = '⬤ SENSOR CONECTADO';
        lblStatus.style.color = '#00e5cc';

        goToMenu();
        readLoop();
    } catch (err) {
        lblStatus.innerText = 'ERROR AL CONECTAR';
        lblStatus.style.color = '#e05577';
        console.error('[TheraFlex] Serial error:', err);
    }
}

async function readLoop() {
    const textDecoder  = new TextDecoderStream();
    const pipePromise  = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();
    let buf = '';

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const lines = buf.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
                const raw = lines[i].trim();
                if (raw.length > 0 && !isNaN(raw)) {
                    processedVal = dsp.process(raw);
                    lblValor.innerText = processedVal.toFixed(1);
                    updateEMGBar();
                }
            }
            buf = lines[lines.length - 1];
        }
    } catch (err) {
        console.warn('[TheraFlex] Serial read ended:', err);
    } finally {
        reader.releaseLock();
    }
}