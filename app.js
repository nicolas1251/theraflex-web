// =============================================
//  THERAFLEX WEB — Motor Principal Completo
//  Basado en la versión local de Python/Tkinter
// =============================================

// --- CLASE DE PROCESAMIENTO DE SEÑAL (DSP) ---
class SignalProcessor {
    constructor() {
        this.promedio_movil = [];
        this.max_len = 30;
        this.dc_offset = 0;
        this.alpha_dc = 0.05;
        this.v_prev = 0;
        this.v_out = 0;
    }

    procesar(raw_val) {
        let val = parseFloat(raw_val);
        if (isNaN(val)) return 0.0;

        this.dc_offset = (1.0 - this.alpha_dc) * this.dc_offset + this.alpha_dc * val;
        let ac_val = val - this.dc_offset;
        this.v_out = 0.5 * (ac_val + this.v_prev);
        this.v_prev = ac_val;
        
        let rectified = Math.abs(this.v_out);
        let amplified = rectified * 1.5;

        this.promedio_movil.push(amplified);
        if (this.promedio_movil.length > this.max_len) this.promedio_movil.shift(); 
        
        let suma = this.promedio_movil.reduce((a, b) => a + b, 0);
        return suma / this.promedio_movil.length;
    }

    reset() {
        this.promedio_movil = [];
        this.dc_offset = 0;
        this.v_prev = 0;
        this.v_out = 0;
    }
}

// --- CONSTANTES DE ESTADO ---
const ESTADO_SPLASH = -1;
const ESTADO_MENU = 0;
const ESTADO_INSTRUCCIONES = 1;
const ESTADO_JUGANDO = 2;
const ESTADO_GAMEOVER = 3;
const ESTADO_CALIBRACION = 4;
const ESTADO_DESCANSO = 5;

// --- VARIABLES GLOBALES ---
let port, reader;
const dsp = new SignalProcessor();
let valor_procesado = 0.0;

let umbral_calibrado = 10.0;
let min_ruido = 0.0;
let max_senal = 50.0;

let estado_actual = ESTADO_SPLASH;
let modo_juego = null;
let frame_animacion = 0;
let dedo_objetivo = 0;

let tiempo_calibracion = 0;
let paso_calibracion = 0;
let buffer_calibracion = [];

let repeticiones = 0;
let inicio_sesion = 0;
let tiempo_fin_descanso = 0;
let tiempo_ultimo_frame = Date.now();

// Referencias DOM
const splashDiv = document.getElementById('splashDiv');
const menuDiv = document.getElementById('menuDiv');
const gameDiv = document.getElementById('gameDiv');
const topBar = document.getElementById('topBar');
const btnConectar = document.getElementById('btnConectar');
const lblStatus = document.getElementById('lblStatus');
const lblValor = document.getElementById('lblValor');
const lblUmbral = document.getElementById('lblUmbral');
const lblReps = document.getElementById('lblReps');
const lblTimer = document.getElementById('lblTimer');
const emgBar = document.getElementById('emgBar');

// Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ANCHO = 900;
const ALTO = 520;

let ultimoWidth = 0;
let ultimoHeight = 0;

function ajustarResolucionCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    if (rect.width !== ultimoWidth || rect.height !== ultimoHeight) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ultimoWidth = rect.width;
        ultimoHeight = rect.height;
    }
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.scale(rect.width / ANCHO, rect.height / ALTO);
}


// --- MARIO SPRITES Y COLORES ---
const MARIO_COLORES = {
    1: "#e52521", // Rojo
    2: "#fec39e", // Piel / Durazno
    3: "#5c3d26", // Marrón / Café
    4: "#002fa7", // Azul
    5: "#fcd116"  // Amarillo
};

const GOOMBA_COLORES = {
    1: "#4a2500", // Café Oscuro (pies)
    2: "#a85400", // Café Claro (cuerpo)
    3: "#ffffff", // Blanco (ojos)
    4: "#000000"  // Negro (pupilas)
};

const MARIO_STAND = [
    [0,0,0,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,0],
    [0,0,3,3,3,2,2,3,2,0,0,0],
    [0,3,2,3,2,2,2,3,2,2,2,0],
    [0,3,2,3,3,2,2,2,3,2,2,2],
    [0,3,3,2,2,2,2,3,3,3,3,0],
    [0,0,0,2,2,2,2,2,2,2,0,0],
    [0,0,3,3,1,3,3,1,3,3,0,0],
    [0,3,3,3,1,3,3,1,3,3,3,0],
    [3,3,3,3,1,1,1,1,3,3,3,3],
    [2,2,3,1,2,1,1,2,1,3,2,2],
    [2,2,2,1,1,1,1,1,1,2,2,2],
    [2,2,1,1,1,1,1,1,1,1,2,2],
    [0,0,1,1,1,0,0,1,1,1,0,0],
    [0,3,3,3,0,0,0,0,3,3,3,0],
    [3,3,3,3,0,0,0,0,3,3,3,3]
];

const MARIO_RUN = [
    [0,0,0,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,0],
    [0,0,3,3,3,2,2,3,2,0,0,0],
    [0,3,2,3,2,2,2,3,2,2,2,0],
    [0,3,2,3,3,2,2,2,3,2,2,2],
    [0,3,3,2,2,2,2,3,3,3,3,0],
    [0,0,0,2,2,2,2,2,2,2,0,0],
    [0,0,1,1,3,1,1,1,0,0,0,0],
    [0,1,1,1,3,1,1,1,3,1,1,0],
    [1,1,1,1,3,3,3,3,1,1,1,1],
    [2,2,1,3,2,1,1,2,3,1,2,2],
    [0,0,3,1,1,1,1,1,1,3,0,0],
    [0,3,3,1,1,1,1,1,1,3,3,0],
    [3,3,3,1,1,0,0,1,1,3,3,3],
    [3,3,0,0,0,0,0,0,0,0,3,3],
    [0,0,0,0,0,0,0,0,0,0,0,0]
];

const MARIO_JUMP = [
    [0,0,0,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,0],
    [0,0,3,3,3,2,2,3,2,0,0,0],
    [0,3,2,3,2,2,2,3,2,2,2,0],
    [0,3,2,3,3,2,2,2,3,2,2,2],
    [0,3,3,2,2,2,2,3,3,3,3,0],
    [0,0,0,2,2,2,2,2,2,2,0,0],
    [0,0,0,1,1,3,1,1,1,0,0,2],
    [0,0,1,1,1,3,1,1,1,1,2,2],
    [0,2,1,1,1,3,3,3,1,1,1,2],
    [2,2,0,1,3,2,1,2,3,1,0,0],
    [2,0,0,3,1,1,1,1,1,3,0,0],
    [0,0,3,3,1,1,1,1,1,3,3,0],
    [0,3,3,3,1,1,1,1,1,3,3,3],
    [3,3,3,0,1,1,0,1,1,0,3,3],
    [3,3,0,0,1,1,0,1,1,0,0,0]
];

const GOOMBA_SPRITE = [
    [0,0,0,0,2,2,2,2,0,0,0,0],
    [0,0,0,2,2,2,2,2,2,0,0,0],
    [0,0,2,2,2,2,2,2,2,2,0,0],
    [0,2,2,4,4,2,2,4,4,2,2,0],
    [2,2,2,4,4,2,2,4,4,2,2,2],
    [2,2,3,3,3,2,2,3,3,3,2,2],
    [2,2,3,4,3,2,2,3,4,3,2,2],
    [2,2,2,3,2,2,2,2,3,2,2,2],
    [0,2,2,2,2,2,2,2,2,2,2,0],
    [0,0,2,2,1,1,1,1,2,2,0,0],
    [0,0,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,0,0,0,0,1,1,1,1],
    [1,1,1,0,0,0,0,0,0,1,1,1]
];

function dibujarSprite(ctx, x, y, matrix, pixelSize, colorMap) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            let colorId = matrix[r][c];
            if (colorId !== 0 && colorMap[colorId]) {
                ctx.fillStyle = colorMap[colorId];
                ctx.fillRect(x + c * pixelSize, y + r * pixelSize, pixelSize, pixelSize);
            }
        }
    }
}

function dibujarNube(x, y) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.roundRect(x, y, 60, 25, 12);
    ctx.roundRect(x + 15, y - 15, 40, 30, 15);
    ctx.fill();
}

function dibujarArbusto(x, y) {
    ctx.fillStyle = "#00a230";
    ctx.beginPath();
    ctx.roundRect(x, y, 80, 30, [15, 15, 0, 0]);
    ctx.roundRect(x + 20, y - 15, 40, 30, 20);
    ctx.fill();
    // Brillo de luz
    ctx.fillStyle = "#3be23b";
    ctx.beginPath();
    ctx.roundRect(x + 5, y + 2, 70, 4, 2);
    ctx.fill();
}

function dibujarSueloMario(suelo_y) {
    let blockWidth = 30;
    let numBlocks = Math.ceil(ANCHO / blockWidth);
    for (let i = 0; i < numBlocks; i++) {
        let x = i * blockWidth;
        let y = suelo_y + 10;
        // Pasto
        ctx.fillStyle = "#00a230";
        ctx.fillRect(x, y, blockWidth, 8);
        ctx.fillStyle = "#8cd600";
        ctx.fillRect(x, y, blockWidth, 3);
        
        // Tierra
        ctx.fillStyle = "#c84c0c";
        ctx.fillRect(x, y + 8, blockWidth, ALTO - (y + 8));
        
        // Contornos de ladrillo
        ctx.strokeStyle = "#943200";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y + 8, blockWidth, ALTO - (y + 8));
        
        ctx.beginPath();
        ctx.moveTo(x, y + 28);
        ctx.lineTo(x + blockWidth, y + 28);
        ctx.moveTo(x, y + 48);
        ctx.lineTo(x + blockWidth, y + 48);
        ctx.stroke();
    }
}

// --- FÍSICAS DE LOS JUEGOS (Ajustes de dificultad) ---
let player_x = 100;
let player_y = 300;
let player_vel = 0;
let obstacles = [];
let timer_obstaculo = 0;

// --- SPRITES EXTRAS (BIRD, SAIYAN Y NAVE) ---
const BIRD_SPRITE = [
    [0,0,0,0,3,3,3,3,3,3,0,0],
    [0,0,0,3,1,1,1,3,2,2,3,0],
    [0,0,3,1,1,1,3,2,2,3,3,3],
    [0,3,1,1,1,1,3,2,3,3,4,3],
    [3,5,1,1,1,1,1,3,3,4,4,3],
    [3,5,5,1,1,1,1,1,3,4,3,0],
    [0,3,5,5,5,1,1,1,3,3,0,0],
    [0,0,3,3,5,5,5,5,3,0,0,0],
    [0,0,0,0,3,3,3,3,0,0,0,0]
];

const HERO_BASE = [
    [0,0,0,1,1,1,1,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,2,2,1,1,0,0,0,0],
    [0,0,0,2,2,2,2,0,0,0,0,0],
    [0,0,0,2,1,2,1,0,0,0,0,0],
    [0,0,0,2,2,2,2,0,0,0,0,0],
    [0,0,4,3,3,3,3,4,0,0,0,0],
    [0,4,4,3,4,4,3,4,4,0,0,0],
    [4,4,4,3,4,4,3,4,4,4,0,0],
    [0,0,4,3,3,3,3,4,0,0,0,0],
    [0,0,0,4,4,4,4,0,0,0,0,0],
    [0,0,3,3,0,0,3,3,0,0,0,0],
    [0,0,3,3,0,0,3,3,0,0,0,0],
    [0,0,4,4,0,0,4,4,0,0,0,0],
    [0,4,4,4,0,0,4,4,4,0,0,0]
];

const HERO_SUPER = [
    [0,0,1,0,1,1,0,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,0,0,0],
    [0,1,1,1,2,2,1,1,1,0,0,0],
    [0,0,1,2,2,2,2,1,0,0,0,0],
    [0,0,0,2,1,2,1,0,0,0,0,0],
    [0,0,0,2,2,2,2,0,0,0,0,0],
    [0,0,4,3,3,3,3,4,0,0,0,0],
    [0,4,4,3,4,4,3,4,4,0,0,0],
    [4,4,4,3,4,4,3,4,4,4,0,0],
    [0,0,4,3,3,3,3,4,0,0,0,0],
    [0,0,0,4,4,4,4,0,0,0,0,0],
    [0,0,3,3,0,0,3,3,0,0,0,0],
    [0,0,3,3,0,0,3,3,0,0,0,0],
    [0,0,4,4,0,0,4,4,0,0,0,0],
    [0,4,4,4,0,0,4,4,4,0,0,0]
];

const SPACESHIP_SPRITE = [
    [0,0,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,0,1,4,4,1,0,0,0,0],
    [0,0,0,0,1,4,4,1,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,2,1,1,2,1,1,0,0],
    [0,1,1,1,2,1,1,2,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,3,1,1,3,1,1,1,1],
    [0,0,0,0,3,3,3,3,0,0,0,0]
];

// Variables añadidas para Juego 4 y estrellas
let lasers = [];
let explosions = [];
let stars = [];
let repeticiones_acumuladas = 0;
let last_laser_time = 0;

// Juego 1
let gravity_j1 = 0.15;      // Gravedad lunar suave para salto floaty y lento (1.4s en el aire)
let jump_force_j1 = -6.5;   // Fuerza de salto reducida para arco controlado
let last_jump_time = 0;
let prev_above_thresh = false; // Detección de flanco de subida (evita saltar continuamente)

// Juego 2
let gravity_j2 = 0.08;      // Caída extremadamente lenta y controlada
let lift_force_j2 = -0.20;  // Elevación muy pausada y terapéutica
let gap_height_j2 = 220;    // Hueco más grande para que sea fácil pasar

// Juego 3
let nivel_carga = 0;
let max_carga = 100;

let modo_demo = false;
let is_space_pressed = false;

// --- CONFIGURACIÓN DE BOTONES Y EVENTOS ---
btnConectar.addEventListener('click', conectarSerial);
const btnDemo = document.getElementById('btnDemo');
if (btnDemo) {
    btnDemo.addEventListener('click', iniciarModoDemo);
}

document.getElementById('btnCalibrar').addEventListener('click', iniciarCalibracion);
document.getElementById('btnJuego1').addEventListener('click', () => iniciarInstrucciones(1));
document.getElementById('btnJuego2').addEventListener('click', () => iniciarInstrucciones(2));
document.getElementById('btnJuego3').addEventListener('click', () => iniciarInstrucciones(3));
document.getElementById('btnJuego4').addEventListener('click', () => iniciarInstrucciones(4));

// Clics en Canvas (Para simular los botones del Canvas de Python)
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const clickX = (e.clientX - rect.left) * (ANCHO / rect.width);
    const clickY = (e.clientY - rect.top) * (ALTO / rect.height);

    console.log(`Canvas Click: x=${clickX.toFixed(1)}, y=${clickY.toFixed(1)} | Estado:${estado_actual} Paso:${paso_calibracion}`);

    if (estado_actual === ESTADO_CALIBRACION) {
        if (paso_calibracion === 0) {
            // Botón EMPEZAR (Dibujado en y=380, h=50, w=300)
            if (clickX > ANCHO/2 - 180 && clickX < ANCHO/2 + 180 && clickY > 320 && clickY < 440) {
                console.log("-> Click EMPEZAR");
                paso_calibracion = 1;
                actualizarPantallaCalibracion();
            }
        } else if (paso_calibracion === 3) {
            // Botón VOLVER AL MENÚ (Dibujado en y=420, h=50, w=300)
            if (clickX > ANCHO/2 - 180 && clickX < ANCHO/2 + 180 && clickY > 360 && clickY < 480) {
                console.log("-> Click VOLVER AL MENÚ");
                mostrarMenuPrincipal();
            }
        } else if (paso_calibracion === 4) {
            // Botón REINTENTAR (Dibujado en y=350, h=50, w=300)
            if (clickX > ANCHO/2 - 180 && clickX < ANCHO/2 + 180 && clickY > 290 && clickY < 410) {
                console.log("-> Click REINTENTAR");
                iniciarCalibracion();
            }
        }
    } else if (estado_actual === ESTADO_INSTRUCCIONES) {
        // Botón COMENZAR TERAPIA (Dibujado en y=470, h=50, w=300)
        if (clickX > ANCHO/2 - 180 && clickX < ANCHO/2 + 180 && clickY > 410 && clickY < 530) {
            console.log("-> Click COMENZAR TERAPIA");
            iniciarPartida();
        }
    } else if (estado_actual === ESTADO_GAMEOVER) {
        // Botón REINICIAR EJERCICIO (Dibujado en y=ALTO/2 + 50)
        if (clickX > ANCHO/2 - 180 && clickX < ANCHO/2 + 180 && clickY > ALTO/2 + 10 && clickY < ALTO/2 + 90) {
            console.log("-> Click REINICIAR EJERCICIO");
            iniciarInstrucciones(modo_juego);
        }
        // Botón MENÚ PRINCIPAL (Dibujado en y=ALTO/2 + 130)
        if (clickX > ANCHO/2 - 180 && clickX < ANCHO/2 + 180 && clickY > ALTO/2 + 90 && clickY < ALTO/2 + 170) {
            console.log("-> Click MENÚ PRINCIPAL");
            mostrarMenuPrincipal();
        }
    }
});

// Mostrar cursor pointer cuando se pasa sobre un botón
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const mouseX = (e.clientX - rect.left) * (ANCHO / rect.width);
    const mouseY = (e.clientY - rect.top) * (ALTO / rect.height);
    
    let sobre_boton = false;
    
    if (estado_actual === ESTADO_CALIBRACION) {
        if (paso_calibracion === 0) {
            sobre_boton = (mouseX > ANCHO/2 - 180 && mouseX < ANCHO/2 + 180 && mouseY > 320 && mouseY < 440);
        } else if (paso_calibracion === 3) {
            sobre_boton = (mouseX > ANCHO/2 - 180 && mouseX < ANCHO/2 + 180 && mouseY > 360 && mouseY < 480);
        } else if (paso_calibracion === 4) {
            sobre_boton = (mouseX > ANCHO/2 - 180 && mouseX < ANCHO/2 + 180 && mouseY > 290 && mouseY < 410);
        }
    } else if (estado_actual === ESTADO_INSTRUCCIONES) {
        sobre_boton = (mouseX > ANCHO/2 - 180 && mouseX < ANCHO/2 + 180 && mouseY > 410 && mouseY < 530);
    } else if (estado_actual === ESTADO_GAMEOVER) {
        sobre_boton = (mouseX > ANCHO/2 - 180 && mouseX < ANCHO/2 + 180 && mouseY > ALTO/2 + 10 && mouseY < ALTO/2 + 90) ||
                      (mouseX > ANCHO/2 - 180 && mouseX < ANCHO/2 + 180 && mouseY > ALTO/2 + 90 && mouseY < ALTO/2 + 170);
    }
    
    canvas.style.cursor = sobre_boton ? 'pointer' : 'default';
});

// Teclado: Simulación de Señal con Barra Espaciadora + ESC para volver
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (estado_actual === ESTADO_JUGANDO || estado_actual === ESTADO_INSTRUCCIONES || estado_actual === ESTADO_DESCANSO)) {
        mostrarMenuPrincipal();
    }
    if (e.code === 'Space') {
        is_space_pressed = true;
        e.preventDefault(); // Evitar scroll de la página
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        is_space_pressed = false;
        e.preventDefault();
    }
});

// ================= GESTIÓN DE VISTAS Y PANTALLAS =================

function mostrarSplash() {
    estado_actual = ESTADO_SPLASH;
    splashDiv.style.display = "flex";
    menuDiv.style.display = "none";
    gameDiv.style.display = "none";
    topBar.style.display = "none";
}

function terminarSplash() {
    splashDiv.style.display = "none";
    topBar.style.display = "flex";
    mostrarMenuPrincipal();
}

function iniciarModoDemo() {
    modo_demo = true;
    lblStatus.innerText = "DEMO (Usa Barra Espaciadora)";
    lblStatus.style.color = "yellow";
    terminarSplash();
}

function mostrarMenuPrincipal() {
    estado_actual = ESTADO_MENU;
    splashDiv.style.display = "none";
    gameDiv.style.display = "none";
    menuDiv.style.display = "flex";
    topBar.style.display = "flex";
    
    lblReps.innerText = "REPS: 0";
    lblTimer.innerText = "00:00";
    lblCalibracion.innerText = `Reposo: ${min_ruido.toFixed(1)} · Máx: ${max_senal.toFixed(1)} · Umbral: ${umbral_calibrado.toFixed(1)}`;
    lblUmbral.innerText = umbral_calibrado.toFixed(1);
}

// ================= LÓGICA DE CALIBRACIÓN =================

function iniciarCalibracion() {
    estado_actual = ESTADO_CALIBRACION;
    paso_calibracion = 0;
    menuDiv.style.display = "none";
    gameDiv.style.display = "flex";
    actualizarPantallaCalibracion();
}

function actualizarPantallaCalibracion() {
    ctx.clearRect(0, 0, ANCHO, ALTO);
    
    if (paso_calibracion === 0) {
        dibujarBotonGenerico(ANCHO/2, 380, "EMPEZAR", "#00e5cc");
    } else if (paso_calibracion === 1) {
        buffer_calibracion = [];
        tiempo_calibracion = Date.now();
        medirCalibracion(3000, 2);
    } else if (paso_calibracion === 2) {
        min_ruido = buffer_calibracion.length ? Math.max(...buffer_calibracion) : 0.0;
        buffer_calibracion = [];
        tiempo_calibracion = Date.now();
        medirCalibracion(3000, 3);
    } else if (paso_calibracion === 3) {
        max_senal = buffer_calibracion.length ? Math.max(...buffer_calibracion) : 50.0;
        let diferencia = max_senal - min_ruido;
        
        if (diferencia < 2.0) {
            paso_calibracion = 4; // Error
            actualizarPantallaCalibracion();
        } else {
            umbral_calibrado = min_ruido + (diferencia * 0.25);
            lblUmbral.innerText = umbral_calibrado.toFixed(1);
        }
    }
}

function medirCalibracion(duracion, siguiente_paso) {
    let now = Date.now();
    let progreso = (now - tiempo_calibracion) / duracion;
    
    if (progreso < 1.0) {
        buffer_calibracion.push(valor_procesado);
        requestAnimationFrame(() => medirCalibracion(duracion, siguiente_paso));
    } else {
        paso_calibracion = siguiente_paso;
        actualizarPantallaCalibracion();
    }
}

// ================= INSTRUCCIONES Y PARTIDA =================

function iniciarInstrucciones(id_juego) {
    estado_actual = ESTADO_INSTRUCCIONES;
    modo_juego = id_juego;
    lblUmbral.innerText = umbral_calibrado.toFixed(1);
    
    menuDiv.style.display = "none";
    gameDiv.style.display = "flex";
    
    frame_animacion = 0;
    dedo_objetivo = 0;
}

function iniciarPartida() {
    estado_actual = ESTADO_JUGANDO;
    repeticiones = 0;
    lblReps.innerText = `REPS: ${repeticiones}`;
    inicio_sesion = Date.now();
    
    player_x = 100;
    player_y = 300;
    player_vel = 0;
    obstacles = [];
    timer_obstaculo = Date.now();
    prev_above_thresh = false;
    
    if (modo_juego === 1) {
        player_y = ALTO - 200;
        last_jump_time = 0;
    } else if (modo_juego === 2) {
        player_y = 200;
    } else if (modo_juego === 3) {
        nivel_carga = 0;
    } else if (modo_juego === 4) {
        lasers = [];
        explosions = [];
        repeticiones_acumuladas = 0;
        last_laser_time = 0;
        stars = [];
        for (let i = 0; i < 40; i++) {
            stars.push({
                x: Math.random() * ANCHO,
                y: Math.random() * ALTO,
                size: 1 + Math.random() * 2,
                speed: 0.5 + Math.random() * 1.5
            });
        }
    }
}

function registrarRepeticion() {
    repeticiones++;
    lblReps.innerText = `REPS: ${repeticiones}`;
    
    if (repeticiones > 0 && repeticiones % 10 === 0) {
        estado_actual = ESTADO_DESCANSO;
        tiempo_fin_descanso = Date.now() + 30000; // 30 segundos
        obstacles = []; // Limpiar obstáculos al iniciar el descanso para evitar acumulaciones
    }
}

function gameOver() {
    estado_actual = ESTADO_GAMEOVER;
    ctx.clearRect(0, 0, ANCHO, ALTO);
}

// ================= RENDERS DE DIBUJO E INTERFAZ CANVASES =================

function interpolar(val_inicio, val_fin, t) {
    return val_inicio + (val_fin - val_inicio) * t;
}

function dibujarDedo(bx, by, tx, ty, grosor, color_borde) {
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.lineCap = "round";
    ctx.lineWidth = grosor;
    ctx.strokeStyle = color_borde;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.lineWidth = grosor - 4;
    ctx.strokeStyle = "#1A1A1A";
    ctx.stroke();
}

function dibujarBotonGenerico(x, y, texto, color) {
    ctx.save();
    ctx.fillStyle = "#1F1B24";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    // Caja del botón
    ctx.beginPath();
    ctx.roundRect(x - 150, y - 25, 300, 50, 8);
    ctx.fill();
    ctx.stroke();
    
    // Texto
    ctx.fillStyle = color;
    ctx.font = "bold 16px Outfit, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, x, y);
    ctx.restore();
}

function animarInstrucciones() {
    let cx = (estado_actual === ESTADO_INSTRUCCIONES) ? ANCHO - 220 : ANCHO / 2;
    let cy = 260;
    
    if (modo_juego === 1) {
        let color_activo = "#ff3333";
        let color_inactivo = "#555555";
        let ciclo_frames = 150; // Animación 2.5x más lenta
        
        frame_animacion = (frame_animacion + 1) % ciclo_frames;
        let t = frame_animacion < ciclo_frames / 2 ? frame_animacion / (ciclo_frames / 2) : 2 - (frame_animacion / (ciclo_frames / 2));
        
        if (frame_animacion === 0) {
            dedo_objetivo = (dedo_objetivo + 1) % 4;
        }

        let bases_x = [-25, 0, 25, 45];
        let bases_y = [cy - 35, cy - 40, cy - 35, cy - 15];
        let puntas_open_x = [-30, 0, 30, 55];
        let puntas_open_y = [cy - 100, cy - 110, cy - 100, cy - 70];
        let pulgar_bx = cx - 40;
        let pulgar_by = cy + 20;
        let pulgar_open_tx = cx - 80;
        let pulgar_open_ty = cy - 30;

        // Palma
        ctx.beginPath();
        ctx.moveTo(cx - 45, cy + 30);
        ctx.lineTo(cx - 40, cy - 30);
        ctx.lineTo(cx, cy - 45);
        ctx.lineTo(cx + 45, cy - 20);
        ctx.lineTo(cx + 50, cy + 30);
        ctx.lineTo(cx + 15, cy + 70);
        ctx.lineTo(cx - 25, cy + 60);
        ctx.closePath();
        ctx.fillStyle = "#1A1A1A";
        ctx.strokeStyle = color_activo;
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();

        let t_pulgar_x = pulgar_open_tx;
        let t_pulgar_y = pulgar_open_ty;

        for (let i = 0; i < 4; i++) {
            let bx = cx + bases_x[i];
            let by = bases_y[i];
            let tx, ty, color;
            
            if (i === dedo_objetivo) {
                tx = interpolar(cx + puntas_open_x[i], cx - 20, t);
                ty = interpolar(puntas_open_y[i], cy - 40, t);
                color = color_activo;
                t_pulgar_x = interpolar(pulgar_open_tx, tx - 10, t);
                t_pulgar_y = interpolar(pulgar_open_ty, ty + 10, t);
            } else {
                tx = cx + puntas_open_x[i];
                ty = puntas_open_y[i];
                color = color_inactivo;
            }
            dibujarDedo(bx, by, tx, ty, 16, color);
        }

        dibujarDedo(pulgar_bx, pulgar_by, t_pulgar_x, t_pulgar_y, 18, color_activo);

        if (t > 0.9) {
            ctx.beginPath();
            ctx.arc(t_pulgar_x, t_pulgar_y, 10, 0, Math.PI * 2);
            ctx.fillStyle = "white";
            ctx.strokeStyle = color_activo;
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
        }

        let nombres = ["ÍNDICE", "MEDIO", "ANULAR", "MEÑIQUE"];
        ctx.fillStyle = "white";
        ctx.font = "bold 16px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText(`TOCA CON EL DEDO ${nombres[dedo_objetivo]}`, cx, cy + 135);

    } else if (modo_juego === 2) {
        let color_activo = "#03e5cc";
        let ciclo_frames = 200; // Animación 2.5x más lenta
        frame_animacion = (frame_animacion + 1) % ciclo_frames;
        let t = frame_animacion < ciclo_frames / 2 ? frame_animacion / (ciclo_frames / 2) : 2 - (frame_animacion / (ciclo_frames / 2));

        let bases_x = [-25, 0, 25, 45];
        let bases_y = [cy - 35, cy - 40, cy - 35, cy - 15];
        let puntas_open_x = [-30, 0, 30, 55];
        let puntas_open_y = [cy - 100, cy - 110, cy - 100, cy - 70];

        // Palma
        ctx.beginPath();
        ctx.moveTo(cx - 45, cy + 30);
        ctx.lineTo(cx - 40, cy - 30);
        ctx.lineTo(cx, cy - 45);
        ctx.lineTo(cx + 45, cy - 20);
        ctx.lineTo(cx + 50, cy + 30);
        ctx.lineTo(cx + 15, cy + 70);
        ctx.lineTo(cx - 25, cy + 60);
        ctx.closePath();
        ctx.fillStyle = "#1A1A1A";
        ctx.strokeStyle = color_activo;
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();

        for (let i = 0; i < 4; i++) {
            let bx = cx + bases_x[i];
            let by = bases_y[i];
            let tx = interpolar(cx + puntas_open_x[i], cx + bases_x[i] * 0.5, t);
            let ty = interpolar(puntas_open_y[i], cy + 10, t);
            dibujarDedo(bx, by, tx, ty, 16, color_activo);
        }

        let pulgar_bx = cx - 40;
        let pulgar_by = cy + 20;
        let t_pulgar_x = interpolar(cx - 80, cx + 20, t);
        let t_pulgar_y = interpolar(cy - 30, cy + 25, t);
        dibujarDedo(pulgar_bx, pulgar_by, t_pulgar_x, t_pulgar_y, 18, color_activo);

        let msg = t > 0.5 ? "CERRAR (PUÑO)" : "ABRIR (MANO)";
        ctx.fillStyle = t > 0.5 ? "#00FF00" : "white";
        ctx.font = "bold 16px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText(msg, cx, cy + 135);

    } else if (modo_juego === 3) {
        let color_activo = "#ffd700";
        let ciclo_frames = 200; // Animación 2.5x más lenta
        frame_animacion = (frame_animacion + 1) % ciclo_frames;
        
        let t = 0.0;
        if (frame_animacion < 50) t = frame_animacion / 50.0;
        else if (frame_animacion < 125) t = 1.0;
        else if (frame_animacion < 175) t = 1.0 - ((frame_animacion - 125) / 50.0);

        let is_tenso = t > 0.8;
        let jx = is_tenso ? (Math.random() - 0.5) * 4 : 0;
        let jy = is_tenso ? (Math.random() - 0.5) * 4 : 0;

        let w_top = 38;
        let w_bot = interpolar(40, 60, t);

        // Antebrazo
        ctx.beginPath();
        ctx.moveTo(cx - w_top + jx, cy + 20 + jy);
        ctx.lineTo(cx + w_top + jx, cy + 20 + jy);
        ctx.lineTo(cx + w_bot + jx, cy + 130 + jy);
        ctx.lineTo(cx - w_bot + jx, cy + 130 + jy);
        ctx.closePath();
        ctx.fillStyle = is_tenso ? "#4A1920" : "#1A1A1A";
        ctx.strokeStyle = color_activo;
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();

        // Líneas de contracción muscular
        if (t > 0.2) {
            ctx.beginPath();
            ctx.moveTo(cx + jx, cy + 40 + jy);
            ctx.lineTo(cx + jx, cy + 110 + jy);
            ctx.lineWidth = interpolar(1, 4, t);
            ctx.strokeStyle = color_activo;
            ctx.stroke();
        }

        // Palma
        ctx.beginPath();
        ctx.moveTo(cx - 45 + jx, cy + 30 + jy);
        ctx.lineTo(cx - 40 + jx, cy - 30 + jy);
        ctx.lineTo(cx + jx, cy - 45 + jy);
        ctx.lineTo(cx + 45 + jx, cy - 20 + jy);
        ctx.lineTo(cx + 50 + jx, cy + 30 + jy);
        ctx.closePath();
        ctx.fillStyle = "#1A1A1A";
        ctx.strokeStyle = color_activo;
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();

        let bases_x = [-25, 0, 25, 45];
        let bases_y = [cy - 35, cy - 40, cy - 35, cy - 15];
        let puntas_open_x = [-30, 0, 30, 55];
        let puntas_open_y = [cy - 100, cy - 110, cy - 100, cy - 70];
        let puntas_fist_x = [-20, 0, 20, 35];
        let puntas_fist_y = [cy - 5, cy - 10, cy - 5, cy + 10];

        for (let i = 0; i < 4; i++) {
            let bx = cx + bases_x[i] + jx;
            let by = bases_y[i] + jy;
            let tx = interpolar(cx + puntas_open_x[i], cx + puntas_fist_x[i], t) + jx;
            let ty = interpolar(puntas_open_y[i], puntas_fist_y[i], t) + jy;
            dibujarDedo(bx, by, tx, ty, 16, color_activo);
        }

        let pulgar_bx = cx - 40 + jx;
        let pulgar_by = cy + 10 + jy;
        let t_pulgar_x = interpolar(cx - 80, cx + 30, t) + jx;
        let t_pulgar_y = interpolar(cy - 30, cy + 5, t) + jy;
        dibujarDedo(pulgar_bx, pulgar_by, t_pulgar_x, t_pulgar_y, 18, color_activo);

        ctx.fillStyle = is_tenso ? color_activo : "gray";
        ctx.font = "bold 16px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText(is_tenso ? "¡MANTÉN TENSIÓN!" : "RELAJA...", cx, cy + 155);

    } else if (modo_juego === 4) {
        let color_activo = "#00ffff";
        let ciclo_frames = 200; // Slower speed
        frame_animacion = (frame_animacion + 1) % ciclo_frames;
        let t = frame_animacion < ciclo_frames / 2 ? frame_animacion / (ciclo_frames / 2) : 2 - (frame_animacion / (ciclo_frames / 2));

        let bases_x = [-25, 0, 25, 45];
        let bases_y = [cy - 35, cy - 40, cy - 35, cy - 15];
        let puntas_open_x = [-30, 0, 30, 55];
        let puntas_open_y = [cy - 100, cy - 110, cy - 100, cy - 70];
        let puntas_fist_x = [-20, 0, 20, 35];
        let puntas_fist_y = [cy - 5, cy - 10, cy - 5, cy + 10];

        // Palma
        ctx.beginPath();
        ctx.moveTo(cx - 45, cy + 30);
        ctx.lineTo(cx - 40, cy - 30);
        ctx.lineTo(cx, cy - 45);
        ctx.lineTo(cx + 45, cy - 20);
        ctx.lineTo(cx + 50, cy + 30);
        ctx.closePath();
        ctx.fillStyle = "#1A1A1A";
        ctx.strokeStyle = color_activo;
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();

        for (let i = 0; i < 4; i++) {
            let bx = cx + bases_x[i];
            let by = bases_y[i];
            let tx = interpolar(cx + puntas_open_x[i], cx + puntas_fist_x[i], t);
            let ty = interpolar(puntas_open_y[i], puntas_fist_y[i], t);
            dibujarDedo(bx, by, tx, ty, 16, color_activo);
        }

        let pulgar_bx = cx - 40;
        let pulgar_by = cy + 10;
        let t_pulgar_x = interpolar(cx - 80, cx + 30, t);
        let t_pulgar_y = interpolar(cy - 30, cy + 5, t);
        dibujarDedo(pulgar_bx, pulgar_by, t_pulgar_x, t_pulgar_y, 18, color_activo);

        // Dibujar mini nave moviéndose horizontalmente abajo de la mano
        let nave_x = cx - 80 + t * 160;
        let nave_y = cy + 85;
        
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.moveTo(nave_x, nave_y - 8);
        ctx.lineTo(nave_x - 10, nave_y + 10);
        ctx.lineTo(nave_x + 10, nave_y + 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.font = "bold 14px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText(`TENSIÓN MUSCULAR: ${Math.floor(t * 100)}%`, cx, cy + 135);
    }
}
}

// Capturador de errores global para diagnóstico visual directo
window.addEventListener('error', (e) => {
    console.error("ERROR GLOBAL DETECTADO:", e.error);
    exponerErrorDOM(e.error || new Error(e.message));
});

function exponerErrorDOM(error) {
    let errDiv = document.getElementById('debugErrorDiv');
    if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'debugErrorDiv';
        errDiv.style = "position:absolute; bottom:15px; left:15px; background:rgba(207,102,121,0.95); color:white; padding:15px; border-radius:8px; font-family:monospace; font-size:12px; z-index:99999; max-width:90%; border:1px solid rgba(255,255,255,0.2); box-shadow:0 10px 30px rgba(0,0,0,0.5); pointer-events:auto;";
        document.body.appendChild(errDiv);
    }
    errDiv.innerHTML = `<strong style="color:#ff8a8a;font-size:13px;">Error en Ejecución:</strong><br>${error.message}<br><pre style="margin:5px 0 0 0;font-size:10px;opacity:0.8;max-height:100px;overflow-y:auto;">${error.stack || ''}</pre>`;
}

// ================= LOOP GRÁFICO 60 FPS =================

function gameLoop() {
    try {
        ajustarResolucionCanvas();
        
        let current_time = Date.now();
        let dt = (current_time - tiempo_ultimo_frame) / 16.667;
        tiempo_ultimo_frame = current_time;
        if (dt > 3) dt = 3; // Evitar saltos si se congela la pestaña

        // Si estamos en modo demo, simular la señal usando la barra espaciadora
        if (modo_demo) {
            if (estado_actual === ESTADO_CALIBRACION) {
                if (paso_calibracion === 1) {
                    valor_procesado = 2.0 + Math.random() * 0.5;
                } else if (paso_calibracion === 2) {
                    valor_procesado = is_space_pressed ? (45.0 + Math.random() * 2.0) : (2.0 + Math.random() * 0.5);
                } else {
                    valor_procesado = is_space_pressed ? (umbral_calibrado + 15.0) : (min_ruido + 0.5);
                }
            } else {
                valor_procesado = is_space_pressed ? (umbral_calibrado + 15.0) : (min_ruido + 0.5);
            }
        }

        // Actualizar barra de señal EMG inferior
        let escala = 120 / (max_senal - min_ruido + 1);
        let ancho_barra = Math.min(120, Math.max(0, (valor_procesado - min_ruido) * escala));
        emgBar.style.width = `${(ancho_barra / 120) * 100}%`;
        
        let color_led = valor_procesado > umbral_calibrado ? "#00FF00" : "#555555";
        emgBar.style.background = valor_procesado > umbral_calibrado ? "var(--teal)" : "var(--muted)";
        lblValor.innerText = valor_procesado.toFixed(1);

        if (estado_actual === ESTADO_SPLASH) {
            requestAnimationFrame(gameLoop);
            return;
        }

    // Cronómetro de la sesión
    if (estado_actual === ESTADO_JUGANDO || estado_actual === ESTADO_DESCANSO) {
        let segs = Math.floor((Date.now() - inicio_sesion) / 1000);
        let mm = String(Math.floor(segs / 60)).padStart(2, '0');
        let ss = String(segs % 60).padStart(2, '0');
        lblTimer.innerText = `TIEMPO: ${mm}:${ss}`;
    }

    // --- RENDERIZADO PRINCIPAL POR ESTADOS ---
    if (estado_actual === ESTADO_CALIBRACION) {
        ctx.clearRect(0, 0, ANCHO, ALTO);
        
        if (paso_calibracion === 0) {
            ctx.fillStyle = "#FF9800";
            ctx.font = "bold 26px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.fillText("ASISTENTE DE CALIBRACIÓN", ANCHO/2, 100);
            
            ctx.fillStyle = "white";
            ctx.font = "16px Outfit, Arial";
            ctx.fillText("Ajustaremos el sistema a tu capacidad muscular de hoy.", ANCHO/2, 160);
            
            ctx.fillStyle = "#8a9bb5";
            ctx.font = "14px Outfit, Arial";
            ctx.fillText("1. Siéntate cómodo.", ANCHO/2, 220);
            ctx.fillText("2. Conecta los electrodos correctamente.", ANCHO/2, 250);
            ctx.fillText("3. Prepárate para seguir las instrucciones en pantalla.", ANCHO/2, 280);
            
            dibujarBotonGenerico(ANCHO/2, 380, "EMPEZAR", "#00e5cc");
            
        } else if (paso_calibracion === 1) {
            ctx.fillStyle = "#00e5cc";
            ctx.font = "bold 24px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.fillText("FASE 1: RELAJACIÓN", ANCHO/2, 160);
            ctx.fillStyle = "white";
            ctx.font = "18px Outfit, Arial";
            ctx.fillText("Deja el músculo COMPLETAMENTE RELAJADO...", ANCHO/2, 220);
            ctx.fillStyle = "gray";
            ctx.fillText("Midiendo ruido basal...", ANCHO/2, 270);
            
            // Barra de progreso calibración
            let progreso = (Date.now() - tiempo_calibracion) / 3000;
            ctx.fillStyle = "#333";
            ctx.fillRect(ANCHO/2 - 200, 320, 400, 10);
            ctx.fillStyle = "white";
            ctx.fillRect(ANCHO/2 - 200, 320, 400 * Math.min(progreso, 1), 10);
            
        } else if (paso_calibracion === 2) {
            ctx.fillStyle = "#CF6679";
            ctx.font = "bold 24px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.fillText("FASE 2: CONTRACCIÓN MÁXIMA", ANCHO/2, 160);
            ctx.fillStyle = "white";
            ctx.font = "20px Outfit, Arial";
            ctx.fillText("¡CONTRAE EL MÚSCULO AHORA!", ANCHO/2, 220);
            ctx.font = "15px Outfit, Arial";
            ctx.fillText("Mantén la fuerza hasta que termine la barra...", ANCHO/2, 260);
            
            // Barra de progreso calibración
            let progreso = (Date.now() - tiempo_calibracion) / 3000;
            ctx.fillStyle = "#333";
            ctx.fillRect(ANCHO/2 - 200, 320, 400, 10);
            ctx.fillStyle = "white";
            ctx.fillRect(ANCHO/2 - 200, 320, 400 * Math.min(progreso, 1), 10);
            
        } else if (paso_calibracion === 3) {
            let diferencia = max_senal - min_ruido;
            let calidad = diferencia > 40 ? "EXCELENTE" : diferencia > 15 ? "BUENA" : "POBRE";
            let color_cal = diferencia > 15 ? "#00e5cc" : "yellow";
            
            ctx.fillStyle = "#00e5cc";
            ctx.font = "bold 26px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.fillText("¡CALIBRACIÓN EXITOSA!", ANCHO/2, 90);
            
            ctx.fillStyle = "white";
            ctx.font = "16px Outfit, Arial";
            ctx.fillText(`Calidad de Señal: `, ANCHO/2 - 60, 150);
            ctx.fillStyle = color_cal;
            ctx.textAlign = "left";
            ctx.fillText(calidad, ANCHO/2 + 60, 150);
            ctx.textAlign = "center";
            
            ctx.fillStyle = "gray";
            ctx.fillText(`Ruido Base: ${min_ruido.toFixed(1)}`, ANCHO/2, 200);
            ctx.fillText(`Fuerza Máxima: ${max_senal.toFixed(1)}`, ANCHO/2, 230);
            
            ctx.fillStyle = "white";
            ctx.font = "bold 20px Outfit, Arial";
            ctx.fillText(`NUEVO UMBRAL DE TRABAJO: ${umbral_calibrado.toFixed(1)}`, ANCHO/2, 300);
            
            dibujarBotonGenerico(ANCHO/2, 420, "VOLVER AL MENÚ", "white");
            
        } else if (paso_calibracion === 4) {
            ctx.fillStyle = "#CF6679";
            ctx.font = "bold 24px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.fillText("⚠️ ERROR DE SEÑAL", ANCHO/2, 150);
            ctx.fillStyle = "white";
            ctx.font = "15px Outfit, Arial";
            ctx.fillText("No se detectó diferencia suficiente entre relajación y tensión.", ANCHO/2, 210);
            ctx.fillText("Revisa los electrodos y vuelve a intentar.", ANCHO/2, 240);
            
            dibujarBotonGenerico(ANCHO/2, 350, "REINTENTAR", "white");
        }
    } 
    
    else if (estado_actual === ESTADO_INSTRUCCIONES) {
        ctx.clearRect(0, 0, ANCHO, ALTO);
        
        let titulo = "";
        let color = "";
        let lineasDetalle = [];
        
        if (modo_juego === 1) {
            titulo = "1 · MARIO RUNNER (COORDINACIÓN)";
            color = "#e52521";
            lineasDetalle = [
                "OBJETIVO TERAPÉUTICO:",
                "• Desarrollar velocidad de contracción muscular.",
                "• Reclutamiento de fibras motoras rápidas.",
                "",
                "INDICACIONES FÍSICAS:",
                "• Realiza una contracción rápida y explosiva del músculo",
                "  (ej. extensión de muñeca o flexión del codo).",
                "• Relaja el brazo de forma inmediata al tocar.",
                "",
                "EN PANTALLA:",
                "• Superar el umbral calibrado hace saltar a Mario.",
                "• Esquiva los Goombas y tuberías para sumar repeticiones.",
                "• Cada 10 repeticiones tendrás 30 segundos de descanso."
            ];
        } else if (modo_juego === 2) {
            titulo = "2 · FLAPPY BIRD (APERTURA SOSTENIDA)";
            color = "#03e5cc";
            lineasDetalle = [
                "OBJETIVO TERAPÉUTICO:",
                "• Entrenar el control tónico y sostenido de la fuerza.",
                "• Evitar contracciones bruscas de tipo espástico.",
                "",
                "INDICACIONES FÍSICAS:",
                "• Realiza una contracción suave y progresiva.",
                "• Mantén el nivel de contracción a mitad de rango",
                "  para hacer flotar al ave en el aire.",
                "• Relaja suavemente el brazo para bajar.",
                "",
                "EN PANTALLA:",
                "• El ave amarilla vuela según tu tensión muscular.",
                "• Pasa por en medio de los tubos verdes para puntuar.",
                "• Mantén la calma para evitar choques."
            ];
        } else if (modo_juego === 3) {
            titulo = "3 · FUERZA ISOMÉTRICA (TENSIÓN KI)";
            color = "#ffd700";
            lineasDetalle = [
                "OBJETIVO TERAPÉUTICO:",
                "• Reclutamiento muscular voluntario máximo.",
                "• Aumentar la fuerza y la resistencia muscular.",
                "",
                "INDICACIONES FÍSICAS:",
                "• Realiza una contracción isométrica máxima (ej. apretar",
                "  el puño con fuerza) y mantén la tensión constante.",
                "• Intenta mantener la barra cargada al 100%.",
                "",
                "EN PANTALLA:",
                "• El personaje en pantalla cargará su Ki de Super Saiyajin.",
                "• Al llegar al 100% de carga, se liberará una descarga",
                "  de energía y sumará 1 repetición.",
                "• Relaja entre repeticiones para no sobrecargar."
            ];
        } else if (modo_juego === 4) {
            titulo = "4 · GRADUACIÓN ESPACIAL (SPACE EXPLORER)";
            color = "#00ffff";
            lineasDetalle = [
                "OBJETIVO TERAPÉUTICO:",
                "• Control analógico fino y dosificación del tono.",
                "• Coordinación viso-motora e inhibición de sobreesfuerzos.",
                "",
                "INDICACIONES FÍSICAS:",
                "• Regula la fuerza muscular gradualmente:",
                "  - Relaja al 100% para ir a la izquierda.",
                "  - Contrae de forma media para mantenerte al centro.",
                "  - Contrae al máximo para ir a la derecha.",
                "",
                "EN PANTALLA:",
                "• La nave espacial se moverá de acuerdo al nivel de fuerza.",
                "• La nave dispara automáticamente. Alinea la nave con",
                "  los asteroides para destruirlos. (5 destruidos = 1 rep)."
            ];
        }
        
        // Dibujar Título arriba
        ctx.fillStyle = color;
        ctx.font = "bold 26px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText(titulo, ANCHO/2, 50);
        
        // Dibujar sección izquierda: Explicación Detallada
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        let startY = 110;
        for (let i = 0; i < lineasDetalle.length; i++) {
            let linea = lineasDetalle[i];
            if (linea.endsWith(":")) {
                ctx.fillStyle = color;
                ctx.font = "bold 15px Outfit, Arial";
            } else {
                ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
                ctx.font = "14px Outfit, Arial";
            }
            ctx.fillText(linea, 60, startY + i * 21);
        }
        
        // Dibujar recuadro animación a la derecha
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(ANCHO - 380, 100, 320, 320, 12);
        ctx.stroke();
        
        animarInstrucciones();
        
        dibujarBotonGenerico(ANCHO/2, 470, "COMENZAR TERAPIA", color);
    } 
    
    else if (estado_actual === ESTADO_DESCANSO) {
        ctx.clearRect(0, 0, ANCHO, ALTO);
        let restante = Math.max(0, Math.ceil((tiempo_fin_descanso - Date.now()) / 1000));
        
        ctx.fillStyle = "#00e5cc";
        ctx.font = "bold 28px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText("¡EXCELENTE TRABAJO!", ANCHO/2, 120);
        
        ctx.fillStyle = "white";
        ctx.font = "16px Outfit, Arial";
        ctx.fillText("Músculo en recuperación. Relaja el brazo por completo.", ANCHO/2, 180);
        
        ctx.strokeStyle = "#00e5cc";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ANCHO/2, 300, 70, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = "white";
        ctx.font = "bold 44px Outfit, Arial";
        ctx.fillText(String(restante), ANCHO/2, 300);
        
        if (restante <= 0) {
            estado_actual = ESTADO_JUGANDO;
            inicio_sesion += 30000; // Agregar tiempo de descanso para no dañar el cronómetro
            obstacles = []; // Limpiar obstáculos
            timer_obstaculo = Date.now() + 2000; // Dar 2 segundos de gracia al reiniciar
        }
    } 
    
    else if (estado_actual === ESTADO_JUGANDO) {
        ctx.clearRect(0, 0, ANCHO, ALTO);
        
        // --- JUEGO 1: COORDINACIÓN (Mario Runner) ---
        if (modo_juego === 1) {
            let suelo_y = ALTO - 100;
            let now = Date.now();
            
            // Fondo cielo de Mario
            ctx.fillStyle = "#5c94fc";
            ctx.fillRect(0, 0, ANCHO, ALTO);
            
            // Nubes en movimiento
            let cloudOffset = (Date.now() / 80) % (ANCHO + 200);
            dibujarNube(ANCHO - cloudOffset, 60);
            dibujarNube(ANCHO * 0.5 - cloudOffset, 120);
            dibujarNube(ANCHO * 1.5 - cloudOffset, 80);
            
            // Arbustos en movimiento
            let bushOffset = (Date.now() / 25) % (ANCHO + 200);
            dibujarArbusto(ANCHO - bushOffset, suelo_y - 20);
            dibujarArbusto(ANCHO * 0.4 - bushOffset, suelo_y - 20);
            dibujarArbusto(ANCHO * 1.3 - bushOffset, suelo_y - 20);

            // Flanco de subida (rising edge) + Cooldown para evitar el doble salto accidental
            let is_above = valor_procesado > umbral_calibrado;
            let rising_edge = is_above && !prev_above_thresh;
            prev_above_thresh = is_above;
            
            if (rising_edge && player_y >= suelo_y && (now - last_jump_time) > 800) {
                player_vel = jump_force_j1;
                last_jump_time = now;
            }
            
            player_vel += gravity_j1 * dt;
            player_y += player_vel * dt;
            if (player_y > suelo_y) {
                player_y = suelo_y;
                player_vel = 0;
            }
            
            // Dibujar suelo de bloques de Mario
            dibujarSueloMario(suelo_y);
            
            // Dibujar Mario (Jugador)
            let sprite_x = 120 - 18;
            let sprite_y = player_y - 10 - 24;
            let marioMatrix = MARIO_STAND;
            if (player_y < suelo_y) {
                marioMatrix = MARIO_JUMP;
            } else {
                marioMatrix = (Math.floor(Date.now() / 150) % 2 === 0) ? MARIO_STAND : MARIO_RUN;
            }
            dibujarSprite(ctx, sprite_x, sprite_y, marioMatrix, 3, MARIO_COLORES);
            
            // Spawn de obstáculos (Goombas o tuberías)
            if (now > timer_obstaculo) {
                let tipo = Math.random() < 0.5 ? 'goomba' : 'pipe';
                obstacles.push({ x: ANCHO, type: tipo, passed: false });
                timer_obstaculo = now + 3500 + Math.random() * 2000;
            }
            
            // Mario AABB
            const m_left = 102 + 4;
            const m_right = 138 - 4;
            const m_top = player_y - 34 + 4;
            const m_bottom = player_y + 14;

            for (let i = obstacles.length - 1; i >= 0; i--) {
                let obs = obstacles[i];
                obs.x -= 3.0 * dt; // Velocidad de obstáculo lenta y terapéutica
                
                let o_left, o_right, o_top, o_bottom;
                
                if (obs.type === 'goomba') {
                    o_left = obs.x + 4;
                    o_right = obs.x + 32;
                    o_top = 388 + 4;
                    o_bottom = 430;
                    
                    // Dibujar Goomba
                    dibujarSprite(ctx, obs.x, 388, GOOMBA_SPRITE, 3, GOOMBA_COLORES);
                } else {
                    // Tubería (Pipe)
                    o_left = obs.x + 2;
                    o_right = obs.x + 36;
                    o_top = 370;
                    o_bottom = 430;
                    
                    // Dibujar Pipe
                    ctx.fillStyle = "#00a230"; // Green main
                    ctx.strokeStyle = "#000000";
                    ctx.lineWidth = 2;
                    
                    // Lip
                    ctx.beginPath();
                    ctx.roundRect(obs.x - 4, 370, 46, 16, 2);
                    ctx.fill();
                    ctx.stroke();
                    
                    // Body
                    ctx.beginPath();
                    ctx.roundRect(obs.x, 386, 38, 44, 2);
                    ctx.fill();
                    ctx.stroke();
                    
                    // Brillo y sombras
                    ctx.fillStyle = "#8cd600"; // Light green highlight
                    ctx.fillRect(obs.x + 4, 386, 4, 44);
                    ctx.fillRect(obs.x, 370, 4, 16);
                    
                    ctx.fillStyle = "#007010"; // Dark green shadow
                    ctx.fillRect(obs.x + 30, 386, 4, 44);
                    ctx.fillRect(obs.x + 36, 370, 4, 16);
                }
                
                // Colisión AABB
                const hit = (m_left < o_right) && (m_right > o_left) && (m_top < o_bottom) && (m_bottom > o_top);
                
                if (hit) {
                    gameOver();
                    break;
                }
                
                // Puntaje
                if (obs.x < 120 && !obs.passed) {
                    registrarRepeticion();
                    obs.passed = true;
                }
                
                if (obs.x < -60) obstacles.splice(i, 1);
            }
        } 
        
        // --- JUEGO 2: APERTURA SOSTENIDA (Flappy Bird) ---
        else if (modo_juego === 2) {
            let is_above = valor_procesado > umbral_calibrado;
            
            if (is_above) {
                player_vel += lift_force_j2 * dt;
            } else {
                player_vel += gravity_j2 * dt;
            }
            player_vel = Math.max(-3, Math.min(3, player_vel)); // Velocidad terminal muy moderada
            player_y += player_vel * dt;
            
            if (player_y < 0) {
                player_y = 0;
                player_vel = 0;
            }
            if (player_y > ALTO - 80) {
                gameOver();
            }
            
            if (estado_actual === ESTADO_JUGANDO) {
                // Fondo celeste Flappy Bird
                ctx.fillStyle = "#70c5cf";
                ctx.fillRect(0, 0, ANCHO, ALTO);
                
                // Nubes en movimiento lento
                let cloudOffset = (Date.now() / 120) % (ANCHO + 200);
                dibujarNube(ANCHO - cloudOffset, 40);
                dibujarNube(ANCHO * 0.4 - cloudOffset, 80);
                
                // Silueta de ciudad al fondo
                ctx.fillStyle = "#61b8c4";
                let cityOffset = (Date.now() / 60) % 200;
                for (let k = 0; k < 6; k++) {
                    let cx = k * 180 - cityOffset;
                    ctx.fillRect(cx, ALTO - 140, 100, 60);
                    ctx.fillRect(cx + 40, ALTO - 160, 80, 80);
                }
                
                // Suelo verde Flappy Bird
                ctx.fillStyle = "#73c726";
                ctx.fillRect(0, ALTO - 80, ANCHO, 80);
                ctx.fillStyle = "#5ba31b";
                ctx.fillRect(0, ALTO - 80, ANCHO, 5);
                ctx.fillStyle = "#ded895";
                ctx.fillRect(0, ALTO - 75, ANCHO, 75);
                
                // Dibujar Jugador (Ave Flappy Bird)
                let sprite_x = 120 - 18;
                let sprite_y = player_y - 15;
                dibujarSprite(ctx, sprite_x, sprite_y, BIRD_SPRITE, 3, {
                    1: "#f8d010", // Amarillo cuerpo
                    2: "#ffffff", // Blanco ojos
                    3: "#000000", // Negro contornos
                    4: "#e85018", // Rojo pico
                    5: "#f88018"  // Naranja ala
                });
                
                // Obstáculos (Pilares dobles)
                let now = Date.now();
                if (now > timer_obstaculo) {
                    let gap_y = 80 + Math.random() * (ALTO - 320); // Asegurar que quede dentro
                    obstacles.push({ x: ANCHO, gap_y: gap_y, gap_h: gap_height_j2, passed: false });
                    timer_obstaculo = now + 4000;
                }
                
                for (let i = obstacles.length - 1; i >= 0; i--) {
                    let obs = obstacles[i];
                    obs.x -= 2.0 * dt;
                    
                    // Pilar superior (Tubería verde de Flappy)
                    ctx.fillStyle = "#73c726";
                    ctx.strokeStyle = "#000000";
                    ctx.lineWidth = 2.5;
                    
                    // Cuerpo pilar superior
                    ctx.beginPath();
                    ctx.roundRect(obs.x + 4, 0, 42, obs.gap_y - 20, [0, 0, 0, 0]);
                    ctx.fill();
                    ctx.stroke();
                    // Boca pilar superior
                    ctx.beginPath();
                    ctx.roundRect(obs.x, obs.gap_y - 20, 50, 20, 3);
                    ctx.fill();
                    ctx.stroke();
                    
                    // Pilar inferior (Tubería verde)
                    // Cuerpo pilar inferior
                    ctx.beginPath();
                    ctx.roundRect(obs.x + 4, obs.gap_y + obs.gap_h + 20, 42, ALTO - 80 - (obs.gap_y + obs.gap_h + 20), [0, 0, 0, 0]);
                    ctx.fill();
                    ctx.stroke();
                    // Boca pilar inferior
                    ctx.beginPath();
                    ctx.roundRect(obs.x, obs.gap_y + obs.gap_h, 50, 20, 3);
                    ctx.fill();
                    ctx.stroke();
                    
                    // Sombras y brillos en tuberías
                    ctx.fillStyle = "#cff57a"; // Brillo
                    ctx.fillRect(obs.x + 8, 0, 5, obs.gap_y - 20);
                    ctx.fillRect(obs.x + 8, obs.gap_y + obs.gap_h + 20, 5, ALTO - 80 - (obs.gap_y + obs.gap_h + 20));
                    ctx.fillRect(obs.x + 4, obs.gap_y - 18, 5, 16);
                    ctx.fillRect(obs.x + 4, obs.gap_y + obs.gap_h + 2, 5, 16);
                    
                    ctx.fillStyle = "#4b8513"; // Sombra
                    ctx.fillRect(obs.x + 36, 0, 6, obs.gap_y - 20);
                    ctx.fillRect(obs.x + 36, obs.gap_y + obs.gap_h + 20, 6, ALTO - 80 - (obs.gap_y + obs.gap_h + 20));
                    ctx.fillRect(obs.x + 42, obs.gap_y - 18, 6, 16);
                    ctx.fillRect(obs.x + 42, obs.gap_y + obs.gap_h + 2, 6, 16);
                    
                    // Colisión (Hitbox indulgente AABB)
                    let bird_left = 120 - 15 + 4;
                    let bird_right = 120 + 15 - 4;
                    let bird_top = player_y - 12 + 4;
                    let bird_bottom = player_y + 12 - 4;
                    
                    let hit = bird_right > obs.x && bird_left < obs.x + 50 &&
                              (bird_top < obs.gap_y || bird_bottom > obs.gap_y + obs.gap_h);
                    
                    if (hit) {
                        gameOver();
                        break;
                    }
                    
                    if (obs.x < 120 && !obs.passed) {
                        registrarRepeticion();
                        obs.passed = true;
                    }
                    
                    if (obs.x < -60) obstacles.splice(i, 1);
                }
            }
        } 
        
        // --- JUEGO 3: FUERZA ISOMÉTRICA (Ki Charging / Saiyan) ---
        else if (modo_juego === 3) {
            let is_above = valor_procesado > umbral_calibrado;
            if (is_above) {
                nivel_carga += 0.8;
            } else {
                nivel_carga -= 0.3;
            }
            nivel_carga = Math.max(0, Math.min(max_carga, nivel_carga));
            
            // Fondo de campo de batalla rocoso
            ctx.fillStyle = "#1e152a"; // Púrpura oscuro
            ctx.fillRect(0, 0, ANCHO, ALTO);
            
            // Horizonte rojizo
            let grad = ctx.createLinearGradient(0, ALTO - 160, 0, ALTO - 80);
            grad.addColorStop(0, "#1e152a");
            grad.addColorStop(1, "#c84c0c");
            ctx.fillStyle = grad;
            ctx.fillRect(0, ALTO - 160, ANCHO, 80);
            
            // Suelo rocoso
            ctx.fillStyle = "#3c2a21";
            ctx.fillRect(0, ALTO - 80, ANCHO, 80);
            ctx.strokeStyle = "#251a15";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, ALTO - 80);
            ctx.lineTo(ANCHO, ALTO - 80);
            ctx.stroke();
            
            let cx = ANCHO / 2;
            let cy = ALTO - 200; // Colocar al personaje de pie sobre el suelo
            
            // Dibujar Aura y chispas si el nivel de carga es alto
            if (nivel_carga > 5) {
                // Dibujar halo de energía (Aura) detrás del jugador
                let auraRadius = 30 + (nivel_carga / max_carga) * 60;
                let auraColor = "rgba(0, 229, 204, 0.4)"; // Cyan / Verde ki
                if (nivel_carga > 50) auraColor = "rgba(255, 215, 0, 0.5)"; // Super saiyajin dorado
                
                ctx.fillStyle = auraColor;
                ctx.beginPath();
                ctx.arc(cx, cy + 20, auraRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Destellos / Rayos de Ki
                ctx.strokeStyle = nivel_carga > 50 ? "#fff275" : "#00ffff";
                ctx.lineWidth = 2;
                let numRayos = Math.floor(nivel_carga / 10);
                for (let r = 0; r < numRayos; r++) {
                    let rx = cx + (Math.random() - 0.5) * 120;
                    let ry = cy + 20 + (Math.random() - 0.5) * 120;
                    ctx.beginPath();
                    ctx.moveTo(rx, ry);
                    ctx.lineTo(rx + (Math.random() - 0.5) * 20, ry - 15 - Math.random() * 20);
                    ctx.stroke();
                }
            }
            
            // Dibujar Personaje (Hero Saiyan)
            let sprite_x = cx - 18;
            let sprite_y = cy - 20;
            let heroMatrix = HERO_BASE;
            
            if (nivel_carga > 50) {
                heroMatrix = HERO_SUPER;
            }
            
            dibujarSprite(ctx, sprite_x, sprite_y, heroMatrix, 3, {
                1: nivel_carga > 50 ? "#ffd700" : "#000000", // Pelo dorado o negro
                2: "#fec39e", // Piel
                3: "#ff6600", // Traje naranja
                4: "#002fa7", // Botas/cinturón azul
                5: "#00ffff"  // Brillo
            });
            
            // Contenedor de barra de carga flotando arriba del personaje
            let barX = cx - 150;
            let barY = 80;
            
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.beginPath();
            ctx.roundRect(barX - 10, barY - 10, 320, 45, 8);
            ctx.fill();
            
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(barX, barY, 300, 25, 6);
            ctx.stroke();
            
            // Relleno de la barra
            let width_relleno = (nivel_carga / max_carga) * 296;
            let color_carga = "#CF6679";
            if (nivel_carga > 50) color_carga = "#ffd700";
            if (nivel_carga > 80) color_carga = "#00e5cc";
            
            ctx.fillStyle = color_carga;
            ctx.beginPath();
            ctx.roundRect(barX + 2, barY + 2, width_relleno, 21, 4);
            ctx.fill();
            
            // Texto del porcentaje
            ctx.fillStyle = "white";
            ctx.font = "bold 16px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.fillText(`CARGA KI: ${Math.floor(nivel_carga)}%`, cx, barY + 18);
            
            ctx.fillStyle = "white";
            ctx.font = "bold 20px Outfit, Arial";
            ctx.fillText("¡CONTRAE EL MÚSCULO PARA CARGAR TU KI!", cx, 40);
            
            if (nivel_carga >= max_carga) {
                nivel_carga = 0;
                registrarRepeticion();
            }
        }
        
        // --- JUEGO 4: GRADUACIÓN ESPACIAL (Space Explorer) ---
        else if (modo_juego === 4) {
            // Fondo espacial oscuro
            ctx.fillStyle = "#0c0a15";
            ctx.fillRect(0, 0, ANCHO, ALTO);
            
            // Dibujar y actualizar estrellas de fondo
            ctx.fillStyle = "white";
            for (let s of stars) {
                s.y += s.speed * dt;
                if (s.y > ALTO) {
                    s.y = 0;
                    s.x = Math.random() * ANCHO;
                }
                ctx.fillRect(s.x, s.y, s.size, s.size);
            }
            
            // Posicionar nave según nivel de fuerza graduado de forma lineal
            let ratio = Math.max(0, Math.min(1, (valor_procesado - min_ruido) / (max_senal - min_ruido + 1)));
            let target_x = 100 + ratio * 700;
            player_x += (target_x - player_x) * 0.15 * dt; // Suavizar movimiento de la nave
            player_y = ALTO - 70;
            
            // Dibujar la Nave
            let sprite_x = player_x - 18;
            let sprite_y = player_y - 12;
            dibujarSprite(ctx, sprite_x, sprite_y, SPACESHIP_SPRITE, 3, {
                1: "#8a9bb5", // Gris
                2: "#ff3333", // Rojo
                3: (Math.floor(Date.now() / 100) % 2 === 0) ? "#ff9d45" : "#ffd700", // Fuego motor
                4: "#00ffff"  // Vidrio
            });
            
            let now = Date.now();
            
            // Auto-disparar láseres cada 400ms
            if (now - last_laser_time > 400) {
                lasers.push({ x: player_x, y: player_y - 15 });
                last_laser_time = now;
            }
            
            // Actualizar y dibujar láseres
            ctx.fillStyle = "#ff3333";
            for (let j = lasers.length - 1; j >= 0; j--) {
                let las = lasers[j];
                las.y -= 7.0 * dt;
                
                ctx.fillRect(las.x - 2, las.y, 4, 15);
                ctx.fillStyle = "#ffff00";
                ctx.fillRect(las.x - 1, las.y + 4, 2, 7);
                ctx.fillStyle = "#ff3333"; // Reset
                
                if (las.y < 0) lasers.splice(j, 1);
            }
            
            // Spawn de asteroides
            if (now > timer_obstaculo) {
                obstacles.push({
                    x: 50 + Math.random() * (ANCHO - 100),
                    y: -30,
                    speedY: 1.2 + Math.random() * 1.5,
                    size: 20 + Math.random() * 15,
                    passed: false
                });
                timer_obstaculo = now + 1200 + Math.random() * 1200;
            }
            
            // Dibujar asteroides y colisiones
            for (let i = obstacles.length - 1; i >= 0; i--) {
                let obs = obstacles[i];
                obs.y += obs.speedY * dt;
                
                // Dibujar Asteroide (Roca gris con cráteres)
                ctx.fillStyle = "#5a525d";
                ctx.beginPath();
                ctx.arc(obs.x, obs.y, obs.size, 0, Math.PI * 2);
                ctx.fill();
                
                // Detalles de cráteres
                ctx.fillStyle = "#3e3740";
                ctx.beginPath();
                ctx.arc(obs.x - obs.size * 0.3, obs.y - obs.size * 0.2, obs.size * 0.25, 0, Math.PI * 2);
                ctx.arc(obs.x + obs.size * 0.2, obs.y + obs.size * 0.3, obs.size * 0.2, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.strokeStyle = "#2b262d";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(obs.x, obs.y, obs.size, 0, Math.PI * 2);
                ctx.stroke();
                
                // Colisión Nave vs Asteroide
                let dist_ship = Math.hypot(player_x - obs.x, player_y - obs.y);
                if (dist_ship < obs.size + 15) {
                    gameOver();
                    break;
                }
                
                if (obs.y > ALTO + 30) obstacles.splice(i, 1);
            }
            
            // Colisiones Láser vs Asteroide
            for (let j = lasers.length - 1; j >= 0; j--) {
                let las = lasers[j];
                for (let i = obstacles.length - 1; i >= 0; i--) {
                    let obs = obstacles[i];
                    let dist = Math.hypot(las.x - obs.x, las.y - obs.y);
                    if (dist < obs.size + 6) {
                        // Crear explosión
                        explosions.push({
                            x: obs.x,
                            y: obs.y,
                            radius: 5,
                            maxRadius: obs.size * 1.6,
                            progress: 0
                        });
                        obstacles.splice(i, 1);
                        lasers.splice(j, 1);
                        
                        repeticiones_acumuladas++;
                        if (repeticiones_acumuladas >= 5) {
                            registrarRepeticion();
                            repeticiones_acumuladas = 0;
                        }
                        break;
                    }
                }
            }
            
            // Dibujar explosiones
            for (let k = explosions.length - 1; k >= 0; k--) {
                let exp = explosions[k];
                exp.progress += 0.12 * dt;
                let currentRadius = interpolar(exp.radius, exp.maxRadius, exp.progress);
                
                // Círculo interno y externo de explosión
                ctx.fillStyle = "rgba(255, 100, 0, " + (1 - exp.progress) + ")";
                ctx.beginPath();
                ctx.arc(exp.x, exp.y, currentRadius, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = "rgba(255, 200, 0, " + (1 - exp.progress) + ")";
                ctx.beginPath();
                ctx.arc(exp.x, exp.y, currentRadius * 0.6, 0, Math.PI * 2);
                ctx.fill();
                
                if (exp.progress >= 1.0) {
                    explosions.splice(k, 1);
                }
            }
            
            // Mostrar HUD superior de asteroides destruidos en la serie
            ctx.fillStyle = "white";
            ctx.font = "14px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.fillText(`Asteroides para siguiente REP: ${repeticiones_acumuladas}/5`, ANCHO / 2, 40);
        }
    } 
    
    else if (estado_actual === ESTADO_GAMEOVER) {
        ctx.clearRect(0, 0, ANCHO, ALTO);
        
        ctx.fillStyle = "#CF6679";
        ctx.font = "bold 36px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText("FIN DE LA SESIÓN", ANCHO/2, ALTO/2 - 100);
        
        ctx.fillStyle = "white";
        ctx.font = "18px Outfit, Arial";
        ctx.fillText(`Lograste ${repeticiones} repeticiones.`, ANCHO/2, ALTO/2 - 30);
        
        dibujarBotonGenerico(ANCHO/2, ALTO/2 + 50, "REINICIAR EJERCICIO", "white");
        dibujarBotonGenerico(ANCHO/2, ALTO/2 + 130, "MENÚ PRINCIPAL", "#bb86fc");
    }

    } catch (e) {
        console.error("ERROR EN GAMELOOP:", e);
        exponerErrorDOM(e);
    }

    requestAnimationFrame(gameLoop);
}

// Inicializar el bucle
requestAnimationFrame(gameLoop);
mostrarSplash();

// ================= PUENTE DE COMUNICACIÓN SERIAL =================

async function conectarSerial() {
    if (!navigator.serial) {
        lblStatus.innerText = "Navegador no soporta Serial API";
        lblStatus.style.color = "var(--pink)";
        return;
    }
    
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        lblStatus.innerText = "SENSOR CONECTADO";
        lblStatus.style.color = "var(--teal)";
        
        terminarSplash();
        leerDatos();
    } catch (err) {
        lblStatus.innerText = "ERROR AL CONECTAR";
        lblStatus.style.color = "var(--pink)";
        console.error("Error Serial:", err);
    }
}

async function leerDatos() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();
    let buffer = "";
    
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += value;
            let lineas = buffer.split('\n');
            for (let i = 0; i < lineas.length - 1; i++) {
                let raw_string = lineas[i].trim();
                if (raw_string.length > 0 && !isNaN(raw_string)) {
                    valor_procesado = dsp.procesar(raw_string);
                }
            }
            buffer = lineas[lineas.length - 1];
        }
    } catch (error) {
        console.error("Error leyendo del puerto serial:", error);
    } finally {
        reader.releaseLock();
    }
}