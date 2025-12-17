const net = require('net');

// ================= CONFIGURACIÓN =================
const PORT = 5678; // El puerto que definiste en tu Host C++
const HOST = '127.0.0.1';
// =================================================

console.log(`\n🩺 INICIANDO DIAGNÓSTICO DE BLOOM NUCLEUS...`);
console.log(`   Objetivo: ${HOST}:${PORT}`);

const client = new net.Socket();
let buffer = Buffer.alloc(0);

// --- PROTOCOLO DE MENSAJES (4 bytes header + JSON) ---

function sendCommand(cmd, payload = {}) {
    const msg = {
        id: `diag_${Date.now()}`,
        command: cmd,
        ...payload
    };
    
    const jsonStr = JSON.stringify(msg);
    const jsonBytes = Buffer.from(jsonStr, 'utf8');
    
    // Header: 4 bytes Little Endian con el largo del mensaje
    const header = Buffer.alloc(4);
    header.writeUInt32LE(jsonBytes.length, 0);
    
    client.write(Buffer.concat([header, jsonBytes]));
    console.log(`\n📤 Enviado: ${cmd}`);
}

// --- MANEJO DE CONEXIÓN ---

client.connect(PORT, HOST, () => {
    console.log('✅ CONEXIÓN TCP EXITOSA: El Host está corriendo.');
    
    // 1. Enviar Ping
    sendCommand('ping');
    
    // 2. Enviar Solicitud de Estado (Para ver si Chrome está enganchado)
    setTimeout(() => {
        sendCommand('get_status');
    }, 500);
});

client.on('data', (chunk) => {
    // Acumular buffer (TCP puede fragmentar)
    buffer = Buffer.concat([buffer, chunk]);
    
    while (buffer.length >= 4) {
        // Leer largo del mensaje
        const msgLen = buffer.readUInt32LE(0);
        
        if (buffer.length >= 4 + msgLen) {
            // Tenemos un mensaje completo
            const rawMsg = buffer.slice(4, 4 + msgLen);
            const rest = buffer.slice(4 + msgLen);
            
            try {
                const json = JSON.parse(rawMsg.toString('utf8'));
                handleResponse(json);
            } catch (e) {
                console.error("❌ Error parseando respuesta JSON:", e);
            }
            
            // Avanzar buffer
            buffer = rest;
        } else {
            // Esperar más datos
            break;
        }
    }
});

function handleResponse(res) {
    if (res.command === 'ping') {
        console.log(`   🟢 PONG Recibido! (Versión Host: ${res.version || '?'})`);
    } else if (res.command === 'get_status' || res.status) {
        console.log(`   📊 ESTADO DEL SISTEMA:`);
        console.log(`      Chrome Conectado: ${res.status?.chrome_connected ? '✅ SÍ' : '❌ NO'}`);
        if (res.status?.chrome_connected) {
             console.log(`      Última Actividad: ${res.status.last_activity_seconds_ago} seg atrás`);
        } else {
             console.log(`      ⚠️  El Host corre, pero la Extensión de Chrome no le está hablando.`);
        }
        client.end(); // Terminamos
    } else {
        console.log('   📩 Respuesta:', res);
    }
}

client.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
        console.error(`\n❌ ERROR: No se puede conectar al puerto ${PORT}.`);
        console.error(`   CAUSA: El proceso 'bloom-host.exe' NO está corriendo.`);
        console.error(`   SOLUCIÓN: Abre Chrome con la extensión instalada. Chrome es quien debe iniciar el Host.`);
    } else {
        console.error(`❌ Error de red: ${err.message}`);
    }
});

client.on('close', () => {
    console.log('\n🏁 Diagnóstico finalizado.');
});