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
}

// --- VARIABLES GLOBALES Y DOM ---
let port, reader;
const dsp = new SignalProcessor();

// Elementos de Interfaz
const splashDiv = document.getElementById('splashDiv');
const menuDiv = document.getElementById('menuDiv');
const gameDiv = document.getElementById('gameDiv');
const topBar = document.getElementById('topBar');
const btnConectar = document.getElementById('btnConectar');
const lblStatus = document.getElementById('lblStatus');
const lblValor = document.getElementById('lblValor');
const lblUmbral = document.getElementById('lblUmbral');
const lblReps = document.getElementById('lblReps');

// Configuración del Lienzo (Canvas)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ANCHO = canvas.width;
const ALTO = canvas.height;

// Variables de Terapia y Estado
let min_ruido = 0.0;
let max_senal = 50.0;
let umbral_calibrado = 10.0;
let valor_procesado = 0.0;

const ESTADO_MENU = 0, ESTADO_CALIBRACION = 1, ESTADO_JUGANDO = 2;
let estado_actual = ESTADO_MENU;
let modo_juego = null;
let repeticiones = 0;

// Variables de Calibración
let paso_calibracion = 0;
let timer_calibracion = 0;
let buffer_calibracion = [];

// Físicas y Tiempos (Juego 1) - AJUSTADOS PARA TERAPIA
let player_y = ALTO - 200;
let player_vel = 0;
const gravity = 0.7;        // Modificado: Cae más lento
const jump_force = -16;     // Modificado: Salto menos brusco
let obstaculos = [];
let last_jump_time = 0;
let last_obstacle_time = 0; 

// --- GESTIÓN DE PANTALLAS ---
function mostrarMenuPrincipal() {
    estado_actual = ESTADO_MENU;
    splashDiv.style.display = "none";
    gameDiv.style.display = "none";
    topBar.style.display = "block";
    menuDiv.style.display = "block";
    
    document.getElementById('lblCalibracion').innerText = `Calibración Actual -> Reposo: ${min_ruido.toFixed(1)} | Máx: ${max_senal.toFixed(1)} | Umbral: ${umbral_calibrado.toFixed(1)}`;
}

function iniciarJuego(modo) {
    modo_juego = modo;
    estado_actual = ESTADO_JUGANDO;
    repeticiones = 0;
    player_y = ALTO - 200;
    player_vel = 0;
    obstaculos = [];
    last_obstacle_time = Date.now();
    lblReps.innerText = `REPETICIONES: ${repeticiones}`;
    
    menuDiv.style.display = "none";
    gameDiv.style.display = "block";
}

// Botones del Menú
document.getElementById('btnCalibrar').addEventListener('click', () => { 
    estado_actual = ESTADO_CALIBRACION;
    paso_calibracion = 0;
    timer_calibracion = Date.now();
    menuDiv.style.display = "none";
    gameDiv.style.display = "block";
});
document.getElementById('btnJuego1').addEventListener('click', () => iniciarJuego(1));
document.getElementById('btnJuego2').addEventListener('click', () => alert("Juego 2 en construcción para Web"));
document.getElementById('btnJuego3').addEventListener('click', () => alert("Juego 3 en construcción para Web"));

// --- MOTOR GRÁFICO (DIBUJO A 60 FPS) ---
function loop() {
    let current_time = Date.now();
    ctx.clearRect(0, 0, ANCHO, ALTO); 

    // -----------------------------------------
    // LÓGICA DE CALIBRACIÓN VISUAL
    // -----------------------------------------
    if (estado_actual === ESTADO_CALIBRACION) {
        ctx.textAlign = "center";
        
        if (paso_calibracion === 0) {
            ctx.fillStyle = "#FF9800";
            ctx.font = "32px Arial bold";
            ctx.fillText("ASISTENTE DE CALIBRACIÓN", ANCHO/2, 150);
            ctx.fillStyle = "white";
            ctx.font = "20px Arial";
            ctx.fillText("Siéntate cómodo y prepárate.", ANCHO/2, 220);
            ctx.fillStyle = "gray";
            ctx.fillText("Iniciando en 3 segundos...", ANCHO/2, 280);
            
            if (current_time - timer_calibracion > 3000) {
                paso_calibracion = 1;
                timer_calibracion = current_time;
                buffer_calibracion = [];
            }
        } 
        else if (paso_calibracion === 1) {
            ctx.fillStyle = "#03DAC6";
            ctx.font = "32px Arial bold";
            ctx.fillText("FASE 1: RELAJACIÓN", ANCHO/2, 150);
            ctx.fillStyle = "white";
            ctx.font = "20px Arial";
            ctx.fillText("Deja el brazo COMPLETAMENTE RELAJADO", ANCHO/2, 220);
            
            buffer_calibracion.push(valor_procesado);
            let progreso = (current_time - timer_calibracion) / 3000;
            
            ctx.fillStyle = "white";
            ctx.fillRect((ANCHO/2) - 200, 320, 400 * Math.min(progreso, 1), 20);

            if (progreso >= 1) {
                min_ruido = Math.max(...buffer_calibracion);
                paso_calibracion = 2;
                timer_calibracion = current_time;
                buffer_calibracion = [];
            }
        }
        else if (paso_calibracion === 2) {
            ctx.fillStyle = "#CF6679";
            ctx.font = "32px Arial bold";
            ctx.fillText("FASE 2: CONTRACCIÓN MÁXIMA", ANCHO/2, 150);
            ctx.fillStyle = "white";
            ctx.font = "24px Arial bold";
            ctx.fillText("¡CONTRAE EL MÚSCULO AHORA!", ANCHO/2, 220);
            
            buffer_calibracion.push(valor_procesado);
            let progreso = (current_time - timer_calibracion) / 3000;
            
            ctx.fillStyle = "white";
            ctx.fillRect((ANCHO/2) - 200, 320, 400 * Math.min(progreso, 1), 20);

            if (progreso >= 1) {
                max_senal = Math.max(...buffer_calibracion);
                let diferencia = max_senal - min_ruido;
                umbral_calibrado = min_ruido + (diferencia * 0.25);
                lblUmbral.innerText = umbral_calibrado.toFixed(1);
                
                paso_calibracion = 3;
                timer_calibracion = current_time;
            }
        }
        else if (paso_calibracion === 3) {
            ctx.fillStyle = "#03DAC6";
            ctx.font = "32px Arial bold";
            ctx.fillText("¡CALIBRACIÓN EXITOSA!", ANCHO/2, 150);
            ctx.fillStyle = "gray";
            ctx.font = "20px Arial";
            ctx.fillText(`Ruido Base: ${min_ruido.toFixed(1)} | Fuerza Máx: ${max_senal.toFixed(1)}`, ANCHO/2, 220);
            ctx.fillStyle = "white";
            ctx.font = "26px Arial bold";
            ctx.fillText(`NUEVO UMBRAL: ${umbral_calibrado.toFixed(1)}`, ANCHO/2, 280);

            if (current_time - timer_calibracion > 4000) {
                mostrarMenuPrincipal();
            }
        }
        ctx.textAlign = "left"; 
    }

    // -----------------------------------------
    // LÓGICA DEL JUEGO 1
    // -----------------------------------------
    else if (estado_actual === ESTADO_JUGANDO && modo_juego === 1) {
        let suelo_y = ALTO - 200;

        // Saltar si supera el umbral
        if (valor_procesado > umbral_calibrado && player_y >= suelo_y && (current_time - last_jump_time) > 300) {
            player_vel = jump_force;
            last_jump_time = current_time;
        }

        // Físicas del jugador
        player_vel += gravity;
        player_y += player_vel;
        if (player_y > suelo_y) {
            player_y = suelo_y;
            player_vel = 0;
        }

        // Dibujar Suelo
        ctx.fillStyle = "white";
        ctx.fillRect(0, suelo_y, ANCHO, 3);

        // Control de spawn de obstáculos (Modificado: más tiempo entre ellos)
        if (current_time - last_obstacle_time > 3500) { 
            obstaculos.push({ x: ANCHO, y: suelo_y - 40, passed: false });
            last_obstacle_time = current_time + (Math.random() * 2000); 
        }

        // Dibujar Jugador
        ctx.beginPath();
        ctx.arc(120, player_y - 20, 20, 0, Math.PI * 2);
        ctx.fillStyle = "#BB86FC";
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Mover y dibujar obstáculos
        for (let i = obstaculos.length - 1; i >= 0; i--) {
            let obs = obstaculos[i];
            obs.x -= 2.0; // Modificado: Velocidad mucho más lenta

            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y + 40);
            ctx.lineTo(obs.x + 20, obs.y);
            ctx.lineTo(obs.x + 40, obs.y + 40);
            ctx.closePath();
            ctx.fillStyle = "#CF6679";
            ctx.fill();

            // Colisión
            if (120 > obs.x && 100 < obs.x + 40 && player_y > obs.y + 10) {
                alert(`¡Golpeaste un obstáculo! Repeticiones logradas: ${repeticiones}`);
                mostrarMenuPrincipal();
            }

            // Puntaje
            if (obs.x < 100 && !obs.passed) {
                repeticiones++;
                lblReps.innerText = `REPETICIONES: ${repeticiones}`;
                obs.passed = true;
            }

            if (obs.x < -50) obstaculos.splice(i, 1);
        }
        
        ctx.fillStyle = "gray";
        ctx.font = "14px Arial";
        ctx.fillText("Refresca la página (F5) para salir", 20, 30);
    }

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// --- CONEXIÓN SERIAL WEB ---
btnConectar.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        lblStatus.innerText = "SENSOR CONECTADO";
        lblStatus.style.color = "#03DAC6";
        mostrarMenuPrincipal();
        leerDatos();
    } catch (err) {
        lblStatus.innerText = "ERROR AL CONECTAR";
        lblStatus.style.color = "#CF6679";
    }
});

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
                    lblValor.innerText = valor_procesado.toFixed(1);
                }
            }
            buffer = lineas[lineas.length - 1];
        }
    } catch (error) {} finally { reader.releaseLock(); }
}