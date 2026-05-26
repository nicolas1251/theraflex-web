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
        if (this.promedio_movil.length > this.max_len) {
            this.promedio_movil.shift(); 
        }

        let suma = this.promedio_movil.reduce((a, b) => a + b, 0);
        return suma / this.promedio_movil.length;
    }
}

// --- VARIABLES GLOBALES Y DOM ---
let port;
let reader;
const dsp = new SignalProcessor();

// Referencias a Pantallas
const splashDiv = document.getElementById('splashDiv');
const menuDiv = document.getElementById('menuDiv');
const gameDiv = document.getElementById('gameDiv');
const topBar = document.getElementById('topBar');

// Referencias a UI
const btnConectar = document.getElementById('btnConectar');
const lblStatus = document.getElementById('lblStatus');
const lblValor = document.getElementById('lblValor');

// Variables de Terapia
let min_ruido = 0.0;
let max_senal = 50.0;
let umbral_calibrado = 10.0;
let valor_procesado = 0.0;

// --- GESTIÓN DE PANTALLAS ---
function mostrarMenuPrincipal() {
    splashDiv.style.display = "none";
    gameDiv.style.display = "none";
    
    topBar.style.display = "block";
    menuDiv.style.display = "block";
}

// Lógica de clics en el menú (Por ahora solo imprimen en consola)
document.getElementById('btnCalibrar').addEventListener('click', () => { console.log("Iniciar Calibración"); });
document.getElementById('btnJuego1').addEventListener('click', () => { console.log("Iniciar Juego 1"); });
document.getElementById('btnJuego2').addEventListener('click', () => { console.log("Iniciar Juego 2"); });
document.getElementById('btnJuego3').addEventListener('click', () => { console.log("Iniciar Juego 3"); });

// --- CONEXIÓN SERIAL WEB ---
btnConectar.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        lblStatus.innerText = "SENSOR CONECTADO";
        lblStatus.style.color = "#03DAC6";
        
        // ¡Cambiamos de pantalla automáticamente al conectar!
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
    } catch (error) {
        console.error("Error leyendo:", error);
    } finally {
        reader.releaseLock();
    }
}