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

        // Filtro y remoción de offset (igual que en tu Python)
        this.dc_offset = (1.0 - this.alpha_dc) * this.dc_offset + this.alpha_dc * val;
        let ac_val = val - this.dc_offset;
        this.v_out = 0.5 * (ac_val + this.v_prev);
        this.v_prev = ac_val;
        
        let rectified = Math.abs(this.v_out);
        let amplified = rectified * 1.5;

        // Lógica del deque (promedio móvil)
        this.promedio_movil.push(amplified);
        if (this.promedio_movil.length > this.max_len) {
            this.promedio_movil.shift(); // Elimina el elemento más viejo
        }

        let suma = this.promedio_movil.reduce((a, b) => a + b, 0);
        return suma / this.promedio_movil.length;
    }
}

// --- CONEXIÓN SERIAL WEB ---
let port;
let reader;
const dsp = new SignalProcessor();

// Referencias a la interfaz HTML
const btnConectar = document.getElementById('btnConectar');
const lblStatus = document.getElementById('lblStatus');
const lblValor = document.getElementById('lblValor');

btnConectar.addEventListener('click', async () => {
    try {
        // 1. Abre el pop-up del navegador pidiendo permiso para usar el USB
        port = await navigator.serial.requestPort();
        
        // 2. Abre la conexión a los mismos baudios de tu Arduino
        await port.open({ baudRate: 9600 });
        
        lblStatus.innerText = "SENSOR CONECTADO";
        lblStatus.style.color = "#03DAC6";
        btnConectar.style.display = "none"; // Ocultar botón al conectar

        // 3. Inicia el ciclo de lectura
        leerDatos();
    } catch (err) {
        lblStatus.innerText = "ERROR AL CONECTAR";
        lblStatus.style.color = "#CF6679";
        console.error("Hubo un error o el usuario canceló:", err);
    }
});

async function leerDatos() {
    // Configuramos un decodificador para convertir los datos raw a texto (strings)
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

            // Procesamos todas las líneas completas recibidas
            for (let i = 0; i < lineas.length - 1; i++) {
                let raw_string = lineas[i].trim();
                
                if (raw_string.length > 0 && !isNaN(raw_string)) {
                    // Pasamos el dato por el procesador DSP
                    let valor_procesado = dsp.procesar(raw_string);
                    
                    // Actualizamos la interfaz HTML en tiempo real
                    lblValor.innerText = valor_procesado.toFixed(1);
                }
            }
            // Guardamos el fragmento incompleto para la próxima iteración
            buffer = lineas[lineas.length - 1];
        }
    } catch (error) {
        console.error("Error leyendo los datos del puerto:", error);
    } finally {
        reader.releaseLock();
    }
}