// extension-installer.js
// Maneja la lógica de instalación de la extensión (drag & drop, validación de ID)

export class ExtensionInstaller {
  constructor(api, uiManager) {
    this.api = api;
    this.ui = uiManager;
    this.currentCrxPath = '';
  }

  /**
   * Prepara el archivo CRX para drag & drop
   */
  async prepareCrxFile() {
    const result = await this.api.installExtension();
    
    if (result.success) {
      this.currentCrxPath = result.crxPath;
      console.log('📦 Archivo listo para arrastrar:', this.currentCrxPath);
      return { success: true, path: result.crxPath };
    } else {
      this.ui.showError("No se pudo preparar el archivo CRX: " + result.error);
      return { success: false, error: result.error };
    }
  }

   /**
   * MODIFICADO: Configura Click para abrir carpeta (Bypass de seguridad de Windows)
   */
  setupDragAndDrop(elementId) {
    const cardEl = document.getElementById(elementId);
    
    if (!cardEl) {
      console.warn(`⚠️ Elemento '${elementId}' no encontrado`);
      return;
    }

    // Aseguramos que parezca clickeable
    cardEl.style.cursor = 'pointer';

    // Limpiamos eventos anteriores para evitar duplicados
    const newCardEl = cardEl.cloneNode(true);
    cardEl.parentNode.replaceChild(newCardEl, cardEl);

    newCardEl.addEventListener('click', () => {
      console.log('🖱️ Click detectado. Path actual:', this.currentCrxPath);

      if (this.currentCrxPath && this.currentCrxPath.length > 0) {
        this.api.showItemInFolder(this.currentCrxPath);
      } else {
        alert("El archivo no está listo aún. Espera unos segundos e intenta de nuevo.");
      }
    });

    console.log('✅ Botón de abrir carpeta configurado');
  }

  /**
   * Valida formato de Extension ID
   */
  validateExtensionId(extensionId) {
    const trimmedId = extensionId.trim();
    
    // Validación: 32 caracteres, solo letras minúsculas
    if (!/^[a-z]{32}$/.test(trimmedId)) {
      return {
        valid: false,
        error: "El ID debe tener 32 letras minúsculas (a-z)"
      };
    }
    
    return { valid: true, id: trimmedId };
  }

  /**
   * Configura el input de Extension ID
   */
  setupIdInput(inputId, buttonId, errorMsgId, onSuccess) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    const errorMsg = document.getElementById(errorMsgId);

    if (!input || !button) {
      console.warn('⚠️ Elementos de ID no encontrados');
      return;
    }

    button.addEventListener('click', async () => {
      const validation = this.validateExtensionId(input.value);
      
      if (!validation.valid) {
        if (errorMsg) {
          errorMsg.style.display = 'block';
          errorMsg.textContent = validation.error;
        }
        return;
      }
      
      if (errorMsg) errorMsg.style.display = 'none';
      
      this.ui.setButtonState(buttonId, true, 'Configurando...');

      // Actualizar ID en backend
      const updateResult = await this.api.updateExtensionId(validation.id);
      
      if (!updateResult.success) {
        this.ui.showError("Error: " + updateResult.error);
        this.ui.setButtonState(buttonId, false, 'Conectar');
        return;
      }

      // Ejecutar callback de éxito
      if (onSuccess) onSuccess(validation.id);
    });

    console.log('✅ Input de ID configurado');
  }

  /**
   * Abre la página de extensiones de Chrome
   */
  openChromeExtensions() {
    this.api.openChromeExtensions();
  }

  /**
   * Resetea el estado
   */
  reset() {
    this.currentCrxPath = '';
  }
}
