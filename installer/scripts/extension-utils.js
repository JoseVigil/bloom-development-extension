const crypto = require('crypto');


// ==========================================
// ALGORITMO OFICIAL DE CHROME PARA IDS
// ==========================================

function generateExtensionId(publicKey) {
    const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
    const head = hash.slice(0, 32);
    
    return head.split('').map(char => {
        if (char >= '0' && char <= '9') {
            return String.fromCharCode(char.charCodeAt(0) + 49);
        } else {
            return String.fromCharCode(char.charCodeAt(0) + 10);
        }
    }).join('');
}

module.exports = { generateExtensionId };