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

// --- FÍSICAS DE LOS JUEGOS (Ajustes de dificultad) ---
let player_x = 100;
let player_y = 300;
let player_vel = 0;
let obstacles = [];
let timer_obstaculo = 0;

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
    }
}

function registrarRepeticion() {
    repeticiones++;
    lblReps.innerText = `REPS: ${repeticiones}`;
    
    if (repeticiones > 0 && repeticiones % 10 === 0) {
        estado_actual = ESTADO_DESCANSO;
        tiempo_fin_descanso = Date.now() + 30000; // 30 segundos
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
    let cx = ANCHO / 2;
    let cy = 250;
    
    if (modo_juego === 1) {
        let color_activo = "#bb86fc";
        let color_inactivo = "#555555";
        let ciclo_frames = 60;
        
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
        ctx.fillText(`TOCA CON EL DEDO ${nombres[dedo_objetivo]}`, cx, cy + 130);

    } else if (modo_juego === 2) {
        let color_activo = "#03e5cc";
        let ciclo_frames = 80;
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
        ctx.fillText(msg, cx, cy + 130);

    } else if (modo_juego === 3) {
        let color_activo = "#CF6679";
        let ciclo_frames = 80;
        frame_animacion = (frame_animacion + 1) % ciclo_frames;
        
        let t = 0.0;
        if (frame_animacion < 20) t = frame_animacion / 20.0;
        else if (frame_animacion < 50) t = 1.0;
        else if (frame_animacion < 70) t = 1.0 - ((frame_animacion - 50) / 20.0);

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
        ctx.fillText(is_tenso ? "¡MANTÉN TENSIÓN!" : "RELAJA...", cx, cy + 160);
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
        let titulo = "", instruccion = "", color = "";
        
        if (modo_juego === 1) {
            titulo = "EJERCICIO 1: COORDINACIÓN";
            instruccion = "Contracción rápida para saltar obstáculos.\nFomenta reflejos rápidos.";
            color = "#bb86fc";
        } else if (modo_juego === 2) {
            titulo = "EJERCICIO 2: APERTURA";
            instruccion = "Mantén contracción media para subir, relaja para bajar.\nFomenta control sostenido.";
            color = "#00e5cc";
        } else if (modo_juego === 3) {
            titulo = "EJERCICIO 3: FUERZA";
            instruccion = "Contrae al máximo para llenar la barra.\nObjetivo: Completar series al 100%.";
            color = "#CF6679";
        }
        
        ctx.fillStyle = color;
        ctx.font = "bold 24px Outfit, Arial";
        ctx.textAlign = "center";
        ctx.fillText(titulo, ANCHO/2, 50);
        
        ctx.fillStyle = "white";
        ctx.font = "15px Outfit, Arial";
        let lineas = instruccion.split('\n');
        ctx.fillText(lineas[0], ANCHO/2, 100);
        if (lineas[1]) ctx.fillText(lineas[1], ANCHO/2, 125);
        
        // Recuadro animación
        ctx.strokeStyle = "gray";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(ANCHO/2 - 220, 150, 440, 240, 10);
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
        }
    } 
    
    else if (estado_actual === ESTADO_JUGANDO) {
        ctx.clearRect(0, 0, ANCHO, ALTO);
        
        // --- JUEGO 1: COORDINACIÓN (Runner) ---
        if (modo_juego === 1) {
            let suelo_y = ALTO - 100;
            let now = Date.now();
            
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
            
            // Dibujar suelo
            ctx.strokeStyle = "white";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, suelo_y + 10);
            ctx.lineTo(ANCHO, suelo_y + 10);
            ctx.stroke();
            
            // Dibujar Jugador (bola morada)
            ctx.beginPath();
            ctx.arc(120, player_y - 10, 20, 0, Math.PI * 2);
            ctx.fillStyle = "#bb86fc";
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
            
            // Spawn de obstáculos (Triángulos)
            if (now > timer_obstaculo) {
                obstacles.push({ x: ANCHO, y: suelo_y - 20, passed: false });
                timer_obstaculo = now + 4000 + Math.random() * 2000; // Obstáculos espaciados y fáciles
            }
            
            for (let i = obstacles.length - 1; i >= 0; i--) {
                let obs = obstacles[i];
                obs.x -= 3.0 * dt; // Velocidad de obstáculo lenta y terapéutica y con dt
                
                // Dibujar obstáculo
                ctx.beginPath();
                ctx.moveTo(obs.x, obs.y + 10);
                ctx.lineTo(obs.x + 20, obs.y - 30);
                ctx.lineTo(obs.x + 40, obs.y + 10);
                ctx.closePath();
                ctx.fillStyle = "#CF6679";
                ctx.strokeStyle = "red";
                ctx.lineWidth = 1;
                ctx.fill();
                ctx.stroke();
                
                // Colisión (Hitbox indulgente de 12px de margen)
                const hit = 120 + 20 - 12 > obs.x + 12 && 
                            120 - 20 + 12 < obs.x + 40 - 12 && 
                            player_y > obs.y - 30 + 12;
                
                if (hit) {
                    gameOver();
                    break;
                }
                
                // Puntaje
                if (obs.x < 120 && !obs.passed) {
                    registrarRepeticion();
                    obs.passed = true;
                }
                
                if (obs.x < -50) obstacles.splice(i, 1);
            }
        } 
        
        // --- JUEGO 2: APERTURA SOSTENIDA (Nave Flappy) ---
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
                // Dibujar Jugador
                ctx.beginPath();
                ctx.arc(120, player_y, 20, 0, Math.PI * 2);
                ctx.fillStyle = "#00e5cc";
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();
                
                // Obstáculos (Pilares dobles)
                let now = Date.now();
                if (now > timer_obstaculo) {
                    let gap_y = 100 + Math.random() * (ALTO - 350);
                    obstacles.push({ x: ANCHO, gap_y: gap_y, gap_h: gap_height_j2, passed: false });
                    timer_obstaculo = now + 4000; // Espaciado cómodo
                }
                
                for (let i = obstacles.length - 1; i >= 0; i--) {
                    let obs = obstacles[i];
                    obs.x -= 2.0 * dt; // Velocidad pausada con dt
                    
                    // Dibujar pilar superior
                    ctx.fillStyle = "#333333";
                    ctx.strokeStyle = "gray";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(obs.x, 0, 50, obs.gap_y, 4);
                    ctx.fill();
                    ctx.stroke();
                    
                    // Dibujar pilar inferior
                    ctx.beginPath();
                    ctx.roundRect(obs.x, obs.gap_y + obs.gap_h, 50, ALTO - (obs.gap_y + obs.gap_h), 4);
                    ctx.fill();
                    ctx.stroke();
                    
                    // Colisión (Hitbox indulgente)
                    let hit = 120 + 20 - 8 > obs.x && 
                              120 - 20 + 8 < obs.x + 50 && 
                              (player_y - 20 + 8 < obs.gap_y || player_y + 20 - 8 > obs.gap_y + obs.gap_h);
                    
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
        
        // --- JUEGO 3: FUERZA ISOMÉTRICA (Barra Carga) ---
        else if (modo_juego === 3) {
            let is_above = valor_procesado > umbral_calibrado;
            if (is_above) {
                nivel_carga += 0.8;
            } else {
                nivel_carga -= 0.3;
            }
            nivel_carga = Math.max(0, Math.min(max_carga, nivel_carga));
            
            let cx = ANCHO / 2;
            let cy = ALTO / 2 - 40;
            
            // Dibujar contenedor de barra exterior
            ctx.strokeStyle = "white";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(cx - 80, cy - 150, 160, 300, 10);
            ctx.stroke();
            
            // Relleno de la barra
            let altura_relleno = (nivel_carga / max_carga) * 290;
            let color_carga = "#CF6679";
            if (nivel_carga > 50) color_carga = "yellow";
            if (nivel_carga > 80) color_carga = "#00FF00";
            
            ctx.fillStyle = color_carga;
            ctx.beginPath();
            ctx.roundRect(cx - 75, (cy + 145) - altura_relleno, 150, altura_relleno, 6);
            ctx.fill();
            
            // Texto del porcentaje
            ctx.fillStyle = nivel_carga > 50 ? "black" : "white";
            ctx.font = "bold 36px Outfit, Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${Math.floor(nivel_carga)}%`, cx, cy);
            
            ctx.fillStyle = "white";
            ctx.font = "16px Outfit, Arial";
            ctx.fillText("¡CONTRAE FUERTE!", cx, cy + 180);
            
            if (nivel_carga >= max_carga) {
                nivel_carga = 0;
                registrarRepeticion();
            }
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